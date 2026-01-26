import { stringify } from 'qs';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

export function setupInterceptors(instance: AxiosInstance): void {
  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    config.headers = config.headers || {};
    config.headers['Content-Type'] = 'application/json';
    config.headers['Pragma'] = 'no-cache';
    config.headers['Expires'] = '-1';

    config.paramsSerializer = {
      serialize: (params: Record<string, unknown>) => {
        return stringify(params);
      },
    };

    return config;
  });
}
