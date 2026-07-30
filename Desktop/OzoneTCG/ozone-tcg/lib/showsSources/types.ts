export type CardShowRecord = {
  name: string;
  start_date: string;          // YYYY-MM-DD
  end_date: string;            // YYYY-MM-DD
  venue_name: string | null;
  venue_address: string | null;
  city: string;
  state: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  website_url: string | null;
  description: string | null;
  is_major: boolean;
  source: string;
  source_url: string | null;
  source_external_id: string | null;
};

export interface ShowsSource {
  readonly name: string;
  fetch(): Promise<CardShowRecord[]>;
}
