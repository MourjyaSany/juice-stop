/**
 * Curated building catalogue — the address UX layer (ADR-004).
 *
 * Serviceability is decided on the *verified delivery address*, not the live device GPS, because
 * civilian GPS is ±30–150 m inside concrete hostel buildings and would reject customers standing
 * in their own room. Picking from a known list also gives the rider gate instructions and a
 * per-building ETA adjustment, which measurably improves delivery times.
 *
 * Replaced in M1 by `GET /geo/buildings`, backed by PostGIS.
 */

export type BuildingType = 'HOSTEL' | 'APARTMENT' | 'PG' | 'OTHER';

export interface Building {
  id: string;
  name: string;
  type: BuildingType;
  zone: string;
  /** Extra minutes for lift queues, long walks, gate checks. */
  extraEtaMinutes: number;
  gateNote?: string;
}

export const BUILDINGS: readonly Building[] = [
  { id: 'b1', name: 'Abode Valley — Tower A', type: 'APARTMENT', zone: 'Abode Valley Core', extraEtaMinutes: 3 },
  { id: 'b2', name: 'Abode Valley — Tower B', type: 'APARTMENT', zone: 'Abode Valley Core', extraEtaMinutes: 3 },
  { id: 'b3', name: 'Abode Valley — Tower C', type: 'APARTMENT', zone: 'Abode Valley Core', extraEtaMinutes: 4, gateNote: 'Guard needs an ID at the gate after 23:00' },
  { id: 'b4', name: 'Abode Valley — Tower D', type: 'APARTMENT', zone: 'Abode Valley Core', extraEtaMinutes: 4 },
  { id: 'b5', name: 'SRM Hostel — Nelson Mandela Block', type: 'HOSTEL', zone: 'SRM Hostel Belt', extraEtaMinutes: 6, gateNote: 'Deliveries to the main gate only' },
  { id: 'b6', name: 'SRM Hostel — Paari Block', type: 'HOSTEL', zone: 'SRM Hostel Belt', extraEtaMinutes: 6, gateNote: 'Deliveries to the main gate only' },
  { id: 'b7', name: 'SRM Hostel — Oori Block', type: 'HOSTEL', zone: 'SRM Hostel Belt', extraEtaMinutes: 6 },
  { id: 'b8', name: 'SRM Hostel — Adhiyaman Block', type: 'HOSTEL', zone: 'SRM Hostel Belt', extraEtaMinutes: 6 },
  { id: 'b9', name: 'SRM Hostel — Kaari Block', type: 'HOSTEL', zone: 'SRM Hostel Belt', extraEtaMinutes: 5 },
  { id: 'b10', name: 'Sai Krishna Residency', type: 'PG', zone: 'Abode Valley Core', extraEtaMinutes: 2 },
  { id: 'b11', name: 'Green Park PG', type: 'PG', zone: 'Abode Valley Core', extraEtaMinutes: 2 },
  { id: 'b12', name: 'Lakshmi Nivas PG', type: 'PG', zone: 'Abode Valley Core', extraEtaMinutes: 2 },
  { id: 'b13', name: 'Potheri Main Road Apartments', type: 'APARTMENT', zone: 'Abode Valley Core', extraEtaMinutes: 3 },
  { id: 'b14', name: 'Vivekananda Street PGs', type: 'PG', zone: 'Abode Valley Core', extraEtaMinutes: 3 },
] as const;

export const BUILDING_TYPE_LABEL: Record<BuildingType, string> = {
  HOSTEL: 'Hostel',
  APARTMENT: 'Apartment',
  PG: 'PG',
  OTHER: 'Other',
};

export const findBuilding = (id: string): Building | undefined =>
  BUILDINGS.find((b) => b.id === id);
