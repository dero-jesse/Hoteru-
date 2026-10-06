const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type StaffRole =
  | "front_desk"
  | "outlet_cashier"
  | "housekeeping"
  | "storekeeper"
  | "procurement"
  | "accountant"
  | "manager"
  | "admin";

export interface StaffUser {
  email: string;
  full_name: string;
  role: StaffRole;
}

export interface AuthSession {
  access_token: string;
  user: StaffUser;
}

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

export async function loginStaff(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  const session = await response.json() as AuthSession;
  const roles: StaffRole[] = [
    "front_desk",
    "outlet_cashier",
    "housekeeping",
    "storekeeper",
    "procurement",
    "accountant",
    "manager",
    "admin",
  ];
  if (
    typeof session.access_token !== "string"
    || typeof session.user?.email !== "string"
    || typeof session.user?.full_name !== "string"
    || !roles.includes(session.user?.role)
  ) {
    throw new Error("The server returned an invalid sign-in response.");
  }
  saveSession(session);
  return session;
}

export function restoreSession(): AuthSession | null {
  const access_token = sessionStorage.getItem("hoteru.access_token");
  const email = sessionStorage.getItem("hoteru.email");
  const full_name = sessionStorage.getItem("hoteru.full_name");
  const role = sessionStorage.getItem("hoteru.role") as StaffRole | null;
  const roles: StaffRole[] = [
    "front_desk",
    "outlet_cashier",
    "housekeeping",
    "storekeeper",
    "procurement",
    "accountant",
    "manager",
    "admin",
  ];
  if (!access_token || !email || !full_name || !role || !roles.includes(role)) return null;
  return { access_token, user: { email, full_name, role } };
}

export function clearSession() {
  sessionStorage.removeItem("hoteru.access_token");
  sessionStorage.removeItem("hoteru.email");
  sessionStorage.removeItem("hoteru.full_name");
  sessionStorage.removeItem("hoteru.role");
}

function saveSession(session: AuthSession) {
  sessionStorage.setItem("hoteru.access_token", session.access_token);
  sessionStorage.setItem("hoteru.email", session.user.email);
  sessionStorage.setItem("hoteru.full_name", session.user.full_name);
  sessionStorage.setItem("hoteru.role", session.user.role);
}

async function request(path: string, body: object): Promise<unknown> {
  const token = sessionStorage.getItem("hoteru.access_token");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw await responseError(response);

  return response.json();
}

export async function getManagementResource(path: string): Promise<unknown> {
  const token = sessionStorage.getItem("hoteru.access_token");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function postManagementAction(path: string, body: object): Promise<unknown> {
  return request(path, body);
}

async function responseError(response: Response): Promise<Error> {
  if (response.status === 401) {
    clearSession();
    window.dispatchEvent(new Event("hoteru:unauthorized"));
  }
  return new Error(await getErrorMessage(response));
}

async function getErrorMessage(response: Response): Promise<string> {
  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") && body) {
    try {
      const payload = JSON.parse(body) as { detail?: unknown };
      if (typeof payload.detail === "string") return payload.detail;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  return body || `Request failed (${response.status})`;
}
