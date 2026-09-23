/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  ownerId?: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  artist?: string;
  album?: string;
  coverImage?: string;
  createdAt: string;
}
