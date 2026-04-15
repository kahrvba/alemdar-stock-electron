const http = require("http");
const { URL } = require("url");
const { Pool } = require("pg");

const SEARCH_SECTIONS = [
  {
    tableKey: "arduino",
    sectionLabel: "Arduino",
    routePath: "/arduino",
    tableName: "public.arduino",
    titleExpr: "english_names",
    subtitleExpr: "COALESCE(turkish_names, category)",
    imageExpr: "image_filename",
    barcodeExpr: "barcode::text",
    priceExpr: "price::text",
    quantityExpr: "COALESCE(quantity, 0)",
    searchableExpr:
      "LOWER(COALESCE(english_names, '') || ' ' || COALESCE(turkish_names, '') || ' ' || COALESCE(category, '') || ' ' || COALESCE(barcode, ''))",
  },
  {
    tableKey: "mainled",
    sectionLabel: "Cable",
    routePath: "/cable",
    tableName: "public.mainled",
    titleExpr: "english_name",
    subtitleExpr: "COALESCE(turkish_name, category)",
    imageExpr: "image_filename",
    barcodeExpr: "barcode::text",
    priceExpr: "price::text",
    quantityExpr: "COALESCE(quantity, 0)",
    searchableExpr:
      "LOWER(COALESCE(english_name, '') || ' ' || COALESCE(turkish_name, '') || ' ' || COALESCE(category, '') || ' ' || COALESCE(barcode, ''))",
  },
  {
    tableKey: "solardb",
    sectionLabel: "Solar",
    routePath: "/solar",
    tableName: "public.solardb",
    titleExpr: "name",
    subtitleExpr: "category",
    imageExpr: "image_filename",
    barcodeExpr: "id::text",
    priceExpr: "selling_price::text",
    quantityExpr: "COALESCE(quantity, 0)",
    searchableExpr:
      "LOWER(COALESCE(name, '') || ' ' || COALESCE(category, '') || ' ' || COALESCE(rating, ''))",
  },
  {
    tableKey: "sound",
    sectionLabel: "Sound",
    routePath: "/sound",
    tableName: "public.sound",
    titleExpr: "english_name",
    subtitleExpr: "COALESCE(turkish_name, category)",
    imageExpr: "image_filename",
    barcodeExpr: "COALESCE(barcode, kodu, id::text)::text",
    priceExpr: "price::text",
    quantityExpr: "COALESCE(quantity, 0)",
    searchableExpr:
      "LOWER(COALESCE(english_name, '') || ' ' || COALESCE(turkish_name, '') || ' ' || COALESCE(category, '') || ' ' || COALESCE(barcode, '') || ' ' || COALESCE(kodu, ''))",
  },
  {
    tableKey: "batteries",
    sectionLabel: "Batteries",
    routePath: "/batteries",
    tableName: "public.batteries",
    titleExpr: "model",
    subtitleExpr: "CONCAT('Volt: ', COALESCE(volt::text, '-'))",
    imageExpr: "image_filename",
    barcodeExpr: "id::text",
    priceExpr: "price::text",
    quantityExpr: "COALESCE(quantity, 0)",
    searchableExpr: "LOWER(COALESCE(model, '') || ' ' || COALESCE(volt::text, ''))",
  },
  {
    tableKey: "tv_remotes",
    sectionLabel: "TV Remotes",
    routePath: "/tv-remotes",
    tableName: "public.tv_remotes",
    titleExpr: "name",
    subtitleExpr: "CONCAT_WS(' • ', brand, category)",
    imageExpr: "image_filename",
    barcodeExpr: "id::text",
    priceExpr: "price::text",
    quantityExpr: "COALESCE(quantity, 0)",
    searchableExpr:
      "LOWER(COALESCE(name, '') || ' ' || COALESCE(brand, '') || ' ' || COALESCE(category, ''))",
  },
  {
    tableKey: "filaments",
    sectionLabel: "Filaments",
    routePath: "/filaments",
    tableName: "public.filaments",
    titleExpr: "name",
    subtitleExpr: "CONCAT_WS(' • ', brand, material, color)",
    imageExpr: "image_filename",
    barcodeExpr: "id::text",
    priceExpr: "price::text",
    quantityExpr: "COALESCE(quantity, 0)",
    searchableExpr:
      "LOWER(COALESCE(name, '') || ' ' || COALESCE(brand, '') || ' ' || COALESCE(material, '') || ' ' || COALESCE(color, '') || ' ' || COALESCE(variant, ''))",
  },
  {
    tableKey: "fans",
    sectionLabel: "Fans",
    routePath: "/fans",
    tableName: "public.fans",
    titleExpr: "english_names",
    subtitleExpr: "COALESCE(turkish_names, category)",
    imageExpr: "image_filename",
    barcodeExpr: "barcode::text",
    priceExpr: "price::text",
    quantityExpr: "COALESCE(quantity, 0)",
    searchableExpr:
      "LOWER(COALESCE(english_names, '') || ' ' || COALESCE(turkish_names, '') || ' ' || COALESCE(category, '') || ' ' || COALESCE(barcode, ''))",
  },
  {
    tableKey: "others",
    sectionLabel: "Others",
    routePath: "/others",
    tableName: "public.others",
    titleExpr: "english_names",
    subtitleExpr: "COALESCE(turkish_names, category)",
    imageExpr: "image_filename",
    barcodeExpr: "barcode::text",
    priceExpr: "price::text",
    quantityExpr: "COALESCE(quantity, 0)",
    searchableExpr:
      "LOWER(COALESCE(english_names, '') || ' ' || COALESCE(turkish_names, '') || ' ' || COALESCE(category, '') || ' ' || COALESCE(barcode, ''))",
  },
  {
    tableKey: "electric",
    sectionLabel: "Electric",
    routePath: "/electric",
    tableName: "public.electric",
    titleExpr: "english_names",
    subtitleExpr: "COALESCE(turkish_names, category)",
    imageExpr: "image_filename",
    barcodeExpr: "id::text",
    priceExpr: "price::text",
    quantityExpr: "COALESCE(quantity, 0)",
    searchableExpr:
      "LOWER(COALESCE(english_names, '') || ' ' || COALESCE(turkish_names, '') || ' ' || COALESCE(category, ''))",
  },
];

const COMPACT_REGEX = "[[:space:]/_.-]+";
const MIN_COMPACT_QUERY_LENGTH = 3;
const PORT = 3791;

const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

let server;
let pool;

const logServer = (message, meta) => {
  const line = `[server] ${message}`;
  if (meta) console.log(line, meta);
  else console.log(line);
};

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function handleSearch(reqUrl, res) {
  const query = reqUrl.searchParams.get("query")?.trim() ?? "";
  const idOnly = reqUrl.searchParams.get("idOnly") === "1";
  logServer("request", { query, idOnly });
  const limitParam = Number(reqUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 80) : 30;
  const perSectionLimitParam = Number(reqUrl.searchParams.get("perSectionLimit"));
  const perSectionLimit =
    Number.isFinite(perSectionLimitParam) && perSectionLimitParam > 0
      ? Math.min(Math.floor(perSectionLimitParam), 12)
      : 5;

  if (!query) {
    sendJson(res, 200, { items: [] });
    return;
  }

  const numericQuery = /^\d+$/.test(query) ? Number(query) : null;
  const normalizedQuery = query.toLowerCase();
  const compactQuery = normalizedQuery.replace(/[ /_.-]+/g, "");
  const escapedLike = `%${escapeLike(normalizedQuery)}%`;
  const escapedPrefixLike = `${escapeLike(normalizedQuery)}%`;
  const escapedCompactLike = compactQuery.length >= MIN_COMPACT_QUERY_LENGTH ? `%${escapeLike(compactQuery)}%` : null;

  const unions = SEARCH_SECTIONS.map((section) => {
    const standardExpr = `REGEXP_REPLACE((${section.searchableExpr}), '[[:space:]]+', ' ', 'g')`;
    const boundaryExpr = `TRIM(REGEXP_REPLACE((${section.searchableExpr}), '${COMPACT_REGEX}', ' ', 'g'))`;
    const compactExpr = `REGEXP_REPLACE((${section.searchableExpr}), '${COMPACT_REGEX}', '', 'g')`;

    const whereClause = idOnly
      ? "($5::int IS NOT NULL AND id = $5::int)"
      : `(
        ${standardExpr} LIKE $2::text
        OR (
          $4::text IS NOT NULL
          AND ${compactExpr} LIKE $4::text
        )
        OR ($5::int IS NOT NULL AND id = $5::int)
      )`;

    return `
      SELECT
        '${section.tableKey}'::text AS table_key,
        '${section.sectionLabel}'::text AS section_label,
        '${section.routePath}'::text AS route_path,
        id,
        ${section.titleExpr} AS title,
        ${section.subtitleExpr} AS subtitle,
        ${section.imageExpr} AS image_filename,
        ${section.barcodeExpr} AS barcode_value,
        ${section.priceExpr} AS price,
        ${section.quantityExpr} AS quantity,
        (
          CASE WHEN $5::int IS NOT NULL AND id = $5::int THEN 1000 ELSE 0 END +
          CASE WHEN ${boundaryExpr} = $1::text THEN 400 ELSE 0 END +
          CASE
            WHEN ${boundaryExpr} LIKE $3::text
              OR ${boundaryExpr} LIKE ('% ' || $3::text)
            THEN 220
            ELSE 0
          END +
          CASE WHEN ${standardExpr} LIKE $2::text THEN 120 ELSE 0 END +
          CASE
            WHEN $4::text IS NOT NULL AND ${compactExpr} LIKE $4::text THEN 30
            ELSE 0
          END
        )::int AS relevance_score
      FROM ${section.tableName}
      WHERE ${whereClause}`;
  }).join("\n\n      UNION ALL\n");

  const sql = `
    WITH unified AS (
${unions}
    ),
    ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY table_key
          ORDER BY relevance_score DESC, id ASC
        ) AS section_rank
      FROM unified
    )
    SELECT *
    FROM ranked
    WHERE section_rank <= $6
    ORDER BY
      relevance_score DESC,
      section_rank ASC,
      table_key ASC,
      id ASC
    LIMIT $7
  `;

  let client;
  try {
    client = await pool.connect();
    await client.query("SET client_encoding = 'UTF8';");

    const result = await client.query(sql, [
      normalizedQuery,
      escapedLike,
      escapedPrefixLike,
      escapedCompactLike,
      numericQuery,
      perSectionLimit,
      limit,
    ]);

    const items = (result.rows ?? []).map((row) => ({
      tableKey: row.table_key,
      section: row.section_label,
      id: row.id,
      title: row.title ?? `Item #${row.id}`,
      subtitle: row.subtitle ?? null,
      image: row.image_filename ?? null,
      barcode: row.barcode_value ?? String(row.id),
      price: row.price ?? null,
      quantity: row.quantity ?? 0,
      href: `${row.route_path}?query=${row.id}&field=id`,
    }));

    sendJson(res, 200, { items, total: items.length });
    logServer("response ok", { count: items.length });
  } catch (error) {
    console.error("[universal-search] Database error:", error);
    sendJson(res, 500, { error: "Failed to search inventory" });
    logServer("response error", { error: error instanceof Error ? error.message : String(error) });
  } finally {
    client?.release();
  }
}

async function startUniversalSearchServer(databaseUrl) {
  if (!databaseUrl) {
    throw new Error("Database URL is missing.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
  }

  if (server) {
    return { port: PORT };
  }

  server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
      if (req.method === "GET" && reqUrl.pathname === "/api/universal-search") {
        await handleSearch(reqUrl, res);
        return;
      }
      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      console.error("API server error:", error);
      sendJson(res, 500, { error: "Internal server error" });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });
  logServer("listening", { port: PORT });

  return { port: PORT };
}

async function stopUniversalSearchServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = undefined;
    logServer("stopped");
  }

  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = {
  startUniversalSearchServer,
  stopUniversalSearchServer,
};
