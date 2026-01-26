import BaseServices from './core/base';
import { setupInterceptors } from './core/interceptors';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { ServicesConfig } from '../types/services';

class Services extends BaseServices {
  #api: AxiosInstance;

  constructor(config: ServicesConfig) {
    super(config);
    this.#api = this.getAxiosInstance();
    setupInterceptors(this.#api);
  }

  get<T>(url: string, params?: Record<string, unknown>, config?: AxiosRequestConfig): Promise<T> {
    return this.#responseHandler<T>(
      this.#api({
        ...config,
        method: 'get',
        url,
        params,
      }),
    );
  }

  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.#responseHandler<T>(this.#api.post(url, data, config));
  }

  form<T>(url: string, formData: FormData, config?: AxiosRequestConfig): Promise<T> {
    return this.#responseHandler<T>(
      this.#api({
        ...config,
        method: 'post',
        url,
        data: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }),
    );
  }

  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.#responseHandler<T>(this.#api.put(url, data, config));
  }

  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.#responseHandler<T>(this.#api.patch(url, data, config));
  }

  delete<T>(url: string, data?: unknown): Promise<T> {
    return this.#responseHandler<T>(this.#api.delete(url, { data }));
  }

  #responseHandler<T>(promise: Promise<AxiosResponse<T>>): Promise<T> {
    return promise.then((res) => res.data);
  }
}

export default Services;
