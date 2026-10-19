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
  { id: "e1", name: "Event name one", lat: 44, lon: 103, image: PLACEHOLDER },
  { id: "e2", name: "Event name two", lat: 36, lon: 39, image: PLACEHOLDER },
  { id: "e3", name: "Event name three", lat: 18, lon: 9, image: PLACEHOLDER },
  { id: "e4", name: "Event name four", lat: 32, lon: -78, image: PLACEHOLDER },
  { id: "e5", name: "Event name five", lat: 7, lon: -61, image: PLACEHOLDER },
];

export const STATS = [
  { value: "43", label: "Chapters", accent: true },
  { value: "180k", label: "Members", accent: false },
  { value: "130", label: "Countries", accent: false },
];
