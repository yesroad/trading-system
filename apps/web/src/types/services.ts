import type { RawAxiosRequestHeaders } from 'axios';

export interface ServicesConfig {
  baseURL: string;
  headers?: RawAxiosRequestHeaders;
}
