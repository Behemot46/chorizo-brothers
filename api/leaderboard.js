import * as blob from '@vercel/blob';
import { createApi } from './_lib.js';
const api = createApi(blob);
export default (req, res) => api.board(req, res);
