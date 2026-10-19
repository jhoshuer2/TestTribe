export type TribeEvent = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  image: string;
};

const PLACEHOLDER = "/assets/event-placeholder.svg";

// Placeholder data — swap for real events/locations.
export const EVENTS: TribeEvent[] = [
  { id: "e1", name: "Event name one", lat: 51.5, lon: 0, image: PLACEHOLDER },
  { id: "e2", name: "Event name two", lat: 30, lon: 31, image: PLACEHOLDER },
  { id: "e3", name: "Event name three", lat: 13, lon: 77.6, image: PLACEHOLDER },
  { id: "e4", name: "Event name four", lat: 39.9, lon: 116.4, image: PLACEHOLDER },
  { id: "e5", name: "Event name five", lat: -1.3, lon: 36.8, image: PLACEHOLDER },
];

export const STATS = [
  { value: "43", label: "Chapters", accent: true },
  { value: "180k", label: "Members", accent: false },
  { value: "130", label: "Countries", accent: false },
];
