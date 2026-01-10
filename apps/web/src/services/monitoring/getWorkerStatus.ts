import { supabase } from "@/lib/supabase";

export type WorkerStatus = {
  service: string;
  run_mode: string;
  state: string;
  last_event_at: string | null;
  last_success_at: string | null;
  message: string | null;
  updated_at: string;
};

export async function getWorkerStatus(service: string) {
  const { data, error } = await supabase
    .from("worker_status")
    .select(
      "service,run_mode,state,last_event_at,last_success_at,message,updated_at"
    )
    .eq("service", service)
    .single();

  if (error) throw new Error(error.message);
  return data as WorkerStatus;
}
