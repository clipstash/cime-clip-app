export type Video = {
  id: string;
  url: string;
  total_time?: string | null;
  status?: string;
  title?: string;
  file_size?: string | number;
  file_url?: string;
  error_message?: string;
  download_name?: string;
};
