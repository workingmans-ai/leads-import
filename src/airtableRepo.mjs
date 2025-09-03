import { cfg } from "./config.mjs";
import { requestJSON } from "./http.mjs";

// Airtable API base URL constructed from the configured base ID
const API = `https://api.airtable.com/v0/${cfg.airtable.baseId}`;

// Standard headers for all Airtable API requests
const HEADERS = {
  Authorization: `Bearer ${cfg.airtable.token}`,
  "Content-Type": "application/json",
};

/**
 * Splits an array into smaller chunks of specified size
 * Used to respect Airtable's batch size limits (max 10 records per request)
 * @param {Array} arr - Array to split
 * @param {number} size - Maximum size of each chunk
 * @returns {Array[]} Array of chunked arrays
 */
const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, (i + 1) * size)
  );

/**
 * Escapes double quotes in values for use in Airtable filter formulas
 * @param {any} v - Value to escape
 * @returns {string} Escaped string value
 */
const quote = (v) => String(v).replace(/"/g, '\\"');

/**
 * Repository class for interacting with Airtable tables
 * Provides CRUD operations with proper error handling, batching, and rate limiting
 */
export class AirtableRepo {
  /**
   * Finds all records in a table where a specific field matches a value
   * Uses Airtable's filterByFormula to search efficiently
   * @param {string} table - Name of the Airtable table
   * @param {string} field - Field name to search on
   * @param {any} value - Value to match against
   * @returns {Promise<Array>} Array of matching records
   */
  async findAllByField(table, field, value) {
    // Create Airtable filter formula: {fieldName} = "value"
    const filter = encodeURIComponent(`{${field}} = "${quote(value)}"`);
    const url = `${API}/${encodeURIComponent(
      table
    )}?filterByFormula=${filter}&pageSize=100`;
    const json = await requestJSON(url, { headers: HEADERS });
    return json.records || [];
  }

  /**
   * Finds exactly one record by field value, with optional duplicate checking
   * @param {string} table - Name of the Airtable table
   * @param {string} field - Field name to search on
   * @param {any} value - Value to match against
   * @returns {Promise<Object|null>} Single matching record or null if not found
   * @throws {Error} If multiple records found and strictDuplicates is enabled
   */
  async findOneByField(table, field, value) {
    const all = await this.findAllByField(table, field, value);
    // Enforce uniqueness if configured to do so
    if (all.length > 1 && cfg.behavior.strictDuplicates) {
      throw new Error(
        `Duplicate ${table} where ${field}="${value}" (${all.length} found)`
      );
    }
    return all[0] || null;
  }

  /**
   * Creates multiple records in a table with proper batching and rate limiting
   * Respects Airtable's API limits: max 10 records per request
   * @param {string} table - Name of the Airtable table
   * @param {Array} records - Array of record objects to create
   * @returns {Promise<Array>} Array of created records with their IDs
   */
  async createMany(table, records) {
    const out = [];
    // Process records in batches to respect API limits
    for (const group of chunk(records, cfg.airtable.limits.batchSize)) {
      const url = `${API}/${encodeURIComponent(table)}`;
      const body = JSON.stringify({ records: group });
      const json = await requestJSON(url, {
        method: "POST",
        headers: HEADERS,
        body,
      });
      out.push(...(json.records || []));
      // Add polite delay between requests to avoid rate limiting
      await new Promise((r) =>
        setTimeout(r, cfg.airtable.limits.politeDelayMs)
      );
    }
    return out;
  }

  /**
   * Updates multiple existing records in a table with proper batching and rate limiting
   * Uses PATCH method to update only specified fields
   * @param {string} table - Name of the Airtable table
   * @param {Array} records - Array of record objects with IDs and fields to update
   * @returns {Promise<Array>} Array of updated records
   */
  async updateMany(table, records) {
    const out = [];
    // Process records in batches to respect API limits
    for (const group of chunk(records, cfg.airtable.limits.batchSize)) {
      const url = `${API}/${encodeURIComponent(table)}`;
      const body = JSON.stringify({ records: group });
      const json = await requestJSON(url, {
        method: "PATCH",
        headers: HEADERS,
        body,
      });
      out.push(...(json.records || []));
      // Add polite delay between requests to avoid rate limiting
      await new Promise((r) =>
        setTimeout(r, cfg.airtable.limits.politeDelayMs)
      );
    }
    return out;
  }

  /**
   * Upserts a record: updates if exists, creates if doesn't exist
   * Determines existence based on a unique key field
   * @param {string} table - Name of the Airtable table
   * @param {string} keyField - Field name to use as unique identifier
   * @param {Object} fields - Field values for the record
   * @returns {Promise<string>} ID of the created or updated record
   * @throws {Error} If keyField value is missing from fields
   */
  async upsertByKey(table, keyField, fields) {
    const keyVal = fields[keyField];
    if (!keyVal) throw new Error(`Upsert missing ${keyField}`);

    // Check if record already exists
    const existing = await this.findOneByField(table, keyField, keyVal);
    if (existing) {
      // Update existing record
      const url = `${API}/${encodeURIComponent(table)}/${existing.id}`;
      const body = JSON.stringify({ fields });
      const json = await requestJSON(url, {
        method: "PATCH",
        headers: HEADERS,
        body,
      });
      return json.id;
    } else {
      // Create new record
      const url = `${API}/${encodeURIComponent(table)}`;
      const body = JSON.stringify({ records: [{ fields }] });
      const json = await requestJSON(url, {
        method: "POST",
        headers: HEADERS,
        body,
      });
      return json.records[0].id;
    }
  }

  /**
   * Efficiently finds records by multiple key values in a single operation
   * Uses OR formula to search for multiple keys at once, with batching for large key sets
   * @param {string} table - Name of the Airtable table
   * @param {string} keyField - Field name to search on
   * @param {Array} keys - Array of key values to find
   * @returns {Promise<Map>} Map of key values to record IDs
   */
  async findRecordsByKeys(table, keyField, keys) {
    const map = new Map();
    // Filter out empty/null keys and create OR conditions
    const parts = keys
      .filter(Boolean)
      .map((k) => `{${keyField}} = "${quote(k)}"`);

    // Process in groups of 20 to avoid URL length limits and improve performance
    for (const group of chunk(parts, 20)) {
      // Create OR formula: OR({field} = "key1", {field} = "key2", ...)
      const filter = encodeURIComponent(`OR(${group.join(",")})`);
      const url = `${API}/${encodeURIComponent(
        table
      )}?filterByFormula=${filter}&pageSize=100`;
      const json = await requestJSON(url, { headers: HEADERS });

      // Build map of key values to record IDs
      for (const rec of json.records || []) {
        const val = rec.fields?.[keyField];
        if (val) map.set(String(val), rec.id);
      }
    }
    return map;
  }
}
