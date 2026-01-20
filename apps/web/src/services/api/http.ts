import axios from 'axios';

export const http = axios.create({
  baseURL: '', // same-origin
  timeout: 10_000,
});
