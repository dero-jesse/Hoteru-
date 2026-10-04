const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface ReservationInput {
  guest_name: string;
  room_code: string;
  check_in: string;
  check_out: string;
  rate_minor: number;
}

export async function checkInGuest(guest_name: string, room_code: string) {
  return request("/front-desk/checkin", { guest_name, room_code });
}

export async function checkOutGuest(guest_name: string, room_code: string) {
  return request("/front-desk/checkout", { guest_name, room_code });
}

export async function createReservation(reservation: ReservationInput) {
  return request("/reservations", reservation);
}

async function request(path: string, body: object): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed (${response.status})`);
  }

  return response.json();
}
