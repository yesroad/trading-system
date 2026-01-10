/**
 * Supabase 서버용 클라이언트
 *
 * - service_role 키 사용
 * - 워커 환경에서만 사용
 * - .env는 kis-collector 기준으로 로드
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) throw new Error("Supabase env missing");

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
