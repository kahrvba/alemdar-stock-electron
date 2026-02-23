"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { useNavigationOverlay } from "@/components/navigation-overlay-provider";

type UniversalSearchItem = {
  tableKey: string;
  section: string;
  id: number;
  title: string;
  subtitle: string | null;
  image: string | null;
  price: string | null;
  quantity: number;
  href: string;
};

type UniversalSearchResponse = {
  items?: UniversalSearchItem[];
  total?: number;
};

const formatPrice = (value: string | null) => {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(numeric);
};

export function UniversalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UniversalSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showOverlay } = useNavigationOverlay();

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/universal-search?query=${encodeURIComponent(trimmedQuery)}&limit=30`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Failed to search inventory");
        }

        const data = (await response.json()) as UniversalSearchResponse;
        setResults(Array.isArray(data.items) ? data.items : []);
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        const message =
          fetchError instanceof Error ? fetchError.message : "Search failed";
        setError(message);
        setResults([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmedQuery]);

  const hasResults = useMemo(() => results.length > 0, [results.length]);

  return (
    <section className="w-full max-w-5xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="universal-inventory-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search all sections by ID, name, category, brand, material..."
          className="h-12 w-full rounded-full border border-border/60 bg-muted/50 pl-11 pr-4 text-sm text-foreground outline-none transition focus:border-border focus:ring-2 focus:ring-border/40"
        />
      </div>

      {trimmedQuery ? (
        <div className="mt-3 rounded-2xl border border-border/60 bg-background/70 p-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Searching all sections...
            </div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-destructive">{error}</div>
          ) : hasResults ? (
            <div className="grid max-h-[26rem] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
              {results.map((item) => (
                <Link
                  key={`${item.tableKey}-${item.id}`}
                  href={item.href}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    showOverlay();
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-2 transition hover:border-foreground/30 hover:bg-card"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.title}
                        fill
                        unoptimized
                        loader={({ src }) => src}
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                      {item.section}
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.subtitle ?? `ID ${item.id}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-muted-foreground">Qty: {Math.max(0, item.quantity ?? 0)}</p>
                    {item.price ? (
                      <p className="text-xs font-semibold text-foreground">
                        {formatPrice(item.price)}
                      </p>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No results for &quot;{trimmedQuery}&quot;.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
