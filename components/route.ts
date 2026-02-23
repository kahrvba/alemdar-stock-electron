import { NextResponse } from "next/server";
import pool from "@/lib/db";

type UniversalSearchRow = {
  table_key: string;
  section_label: string;
  route_path: string;
  id: number;
  title: string | null;
  subtitle: string | null;
  image_filename: string | null;
  price: string | null;
  quantity: number | null;
  relevance_score: number;
};

type SearchSectionConfig = {
  tableKey: string;
  sectionLabel: string;
  routePath: string;
  tableName: string;
  titleExpr: string;
  subtitleExpr: string;
  imageExpr: string;
  priceExpr: string;
  quantityExpr: string;
  searchableExpr: string;
};

const SEARCH_SECTIONS: SearchSectionConfig[] = [
  {
    tableKey: "arduino",
    sectionLabel: "Arduino",
    routePath: "/arduino",
    tableName: "public.arduino",
    titleExpr: "english_names",
    subtitleExpr: "COALESCE(turkish_names, category)",
    imageExpr: "image_filename",
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
    priceExpr: "price::text",
    quantityExpr: "COALESCE(quantity, 0)",
    searchableExpr:
      "LOWER(COALESCE(english_names, '') || ' ' || COALESCE(turkish_names, '') || ' ' || COALESCE(category, ''))",
  },
];

const COMPACT_REGEX = "[[:space:]/_.-]+";
const MIN_COMPACT_QUERY_LENGTH = 3;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query")?.trim() ?? "";
  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), 80)
      : 30;
  const perSectionLimitParam = Number(searchParams.get("perSectionLimit"));
  const perSectionLimit =
    Number.isFinite(perSectionLimitParam) && perSectionLimitParam > 0
      ? Math.min(Math.floor(perSectionLimitParam), 12)
      : 5;

  if (!query) {
    return NextResponse.json({ items: [] });
  }

  const numericQuery = /^\d+$/.test(query) ? Number(query) : null;
  const normalizedQuery = query.toLowerCase();
  const compactQuery = normalizedQuery.replace(/[ /_.-]+/g, "");
  const escapedLike = `%${escapeLike(normalizedQuery)}%`;
  const escapedPrefixLike = `${escapeLike(normalizedQuery)}%`;
  const escapedCompactLike =
    compactQuery.length >= MIN_COMPACT_QUERY_LENGTH
      ? `%${escapeLike(compactQuery)}%`
      : null;

  const unions = SEARCH_SECTIONS.map((section) => {
    const standardExpr = `REGEXP_REPLACE((${section.searchableExpr}), '[[:space:]]+', ' ', 'g')`;
    const boundaryExpr = `TRIM(REGEXP_REPLACE((${section.searchableExpr}), '${COMPACT_REGEX}', ' ', 'g'))`;
    const compactExpr = `REGEXP_REPLACE((${section.searchableExpr}), '${COMPACT_REGEX}', '', 'g')`;

    return `
      SELECT
        '${section.tableKey}'::text AS table_key,
        '${section.sectionLabel}'::text AS section_label,
        '${section.routePath}'::text AS route_path,
        id,
        ${section.titleExpr} AS title,
        ${section.subtitleExpr} AS subtitle,
        ${section.imageExpr} AS image_filename,
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
      WHERE (
        ${standardExpr} LIKE $2::text
        OR (
          $4::text IS NOT NULL
          AND ${compactExpr} LIKE $4::text
        )
        OR ($5::int IS NOT NULL AND id = $5::int)
      )`
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

  let client:
    | {
        query: (
          text: string,
          params?: unknown[]
        ) => Promise<{ rows: UniversalSearchRow[] }>;
        release: () => void;
      }
    | undefined;

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
      price: row.price ?? null,
      quantity: row.quantity ?? 0,
      href: `${row.route_path}?query=${row.id}&field=id`,
    }));

    return NextResponse.json(
      {
        items,
        total: items.length,
      },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  } catch (error) {
    console.error("[universal-search] Database error:", error);
    return NextResponse.json(
      { error: "Failed to search inventory" },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
