import { supabase } from "@/lib/supabase";

export type IngestionRun = {
  id: number;
  job: string;
  symbols: string[];
  timeframe: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed";
  inserted_count: number;
  updated_count: number;
  error_message: string | null;
};

export async function getRecentIngestionRuns(params: { limit?: number }) {
  const limit = params.limit ?? 20;

  const { data, error } = await supabase
    .from("ingestion_runs")
    .select(
      "id,job,symbols,timeframe,started_at,finished_at,status,inserted_count,updated_count,error_message"
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as IngestionRun[];
}
