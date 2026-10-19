import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  checkInGuest,
  checkOutGuest,
  cancelReservation,
  createReservation,
  clearSession,
  AuthSession,
  FrontDeskStay,
  getAvailableRooms,
  getManagementResource,
  getFrontDeskVisitors,
  getReservations,
  getRooms,
  HotelRoom,
  loginStaff,
  postManagementAction,
  Reservation,
  restoreSession,
  StaffRole,
  StaffUser,
} from "./api";

type IconName =
  | "home"
  | "users"
  | "calendar"
  | "clock"
  | "settings"
  | "search"
  | "bell"
  | "plus"
  | "arrow"
  | "key"
  | "check"
  | "close"
  | "chevron"
  | "building"
  | "sparkle"
  | "more"
  | "sun"
  | "moon"
  | "filter";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4L7.3 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2Z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    key: <><circle cx="8" cy="15" r="5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L21 8l-3-3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    building: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4" /></>,
    sparkle: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    moon: <path d="M20.2 15.3A8.5 8.5 0 0 1 8.7 3.8 8.5 8.5 0 1 0 20.2 15.3Z" />,
    filter: <><path d="M4 7h16M7 12h10m-7 5h4" /></>,
  };

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

type Visitor = {
  name: string;
  initials: string;
  company: string;
  room: string;
  time: string;
  status: "Inside" | "Checked out";
  balanceMinor: number;
  depositMinor: number;
  charges: FrontDeskStay["charges"];
};

const UGANDA_LOCALE = "en-UG";
const UGANDA_TIME_ZONE = "Africa/Kampala";
const UGANDA_CURRENCY = "UGX";

function visitorFromStay(stay: FrontDeskStay): Visitor {
  const checkedInAt = new Date(stay.checked_in_at);
  const initials = stay.guest_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return {
    name: stay.guest_name,
    initials,
    company: "Hotel guest",
    room: stay.room_code,
    time: Number.isNaN(checkedInAt.getTime())
      ? "—"
      : new Intl.DateTimeFormat(UGANDA_LOCALE, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: UGANDA_TIME_ZONE,
      }).format(checkedInAt),
    status: stay.status === "open" ? "Inside" : "Checked out",
    balanceMinor: stay.closing_balance_minor,
    depositMinor: stay.deposit_balance_minor,
    charges: stay.charges,
  };
}

function hotelDateToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: UGANDA_TIME_ZONE,
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addHotelDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type ModalKind = "checkin" | "reservation" | "checkout" | null;
type PageKind =
  | "Overview"
  | "Visitors"
  | "Appointments"
  | "History"
  | "Management"
  | "Operations"
  | "People"
  | "Finance"
  | "Reports"
  | "Approvals"
  | "Resources"
  | "Outlet";

const managementPages: PageKind[] = [
  "Management",
  "Operations",
  "People",
  "Finance",
  "Reports",
  "Approvals",
  "Resources",
];

function pagesForRole(role: StaffRole): PageKind[] {
  if (role === "manager" || role === "admin") {
    return ["Management", "Operations", "People", "Finance", "Reports", "Approvals", "Resources", "Overview", "Visitors", "Appointments", "History", "Outlet"];
  }
  if (role === "front_desk") return ["Overview", "Visitors", "Appointments", "History"];
  if (role === "accountant") return ["Finance", "Reports", "Resources"];
  if (role === "outlet_cashier") return ["Outlet"];
  if (role === "procurement" || role === "storekeeper") return ["Resources"];
  return [];
}

function defaultPageForRole(role: StaffRole): PageKind {
  if (role === "manager" || role === "admin") return "Management";
  if (role === "front_desk") return "Overview";
  if (role === "accountant") return "Finance";
  if (role === "outlet_cashier") return "Outlet";
  return "Resources";
}

function navigationForRole(role: StaffRole): Array<[PageKind, IconName]> {
  if (role === "manager" || role === "admin") {
    return [
      ["Management", "home"],
      ["Operations", "building"],
      ["People", "users"],
      ["Finance", "sparkle"],
      ["Reports", "calendar"],
      ["Approvals", "bell"],
      ["Resources", "settings"],
      ["Overview", "key"],
      ["Outlet", "building"],
    ];
  }
  if (role === "front_desk") {
    return [["Overview", "home"], ["Visitors", "users"], ["Appointments", "calendar"], ["History", "clock"]];
  }
  if (role === "accountant") return [["Finance", "sparkle"], ["Reports", "calendar"], ["Resources", "settings"]];
  if (role === "outlet_cashier") return [["Outlet", "building"]];
  if (role === "procurement" || role === "storekeeper") return [["Resources", "settings"]];
  return [];
}

function App() {
  const [session, setSession] = useState(() => restoreSession());
  const [theme, setTheme] = useState<"light" | "dark">(
    () => localStorage.getItem("hoteru.theme") === "dark" ? "dark" : "light",
  );
  const [authReady, setAuthReady] = useState(() => !restoreSession());
  const [page, setPage] = useState<PageKind>(() => session ? defaultPageForRole(session.user.role) : "Overview");
  const [query, setQuery] = useState("");
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [frontDeskLoading, setFrontDeskLoading] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [checkoutVisitor, setCheckoutVisitor] = useState<Visitor | null>(null);
  const [availableRooms, setAvailableRooms] = useState<HotelRoom[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [reservationCheckIn, setReservationCheckIn] = useState(hotelDateToday);
  const [reservationCheckOut, setReservationCheckOut] = useState(() => addHotelDays(hotelDateToday(), 1));
  const [selectedReservationRoom, setSelectedReservationRoom] = useState("");
  const [reservationRate, setReservationRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("hoteru.theme", theme);
  }, [theme]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    const savedSession = restoreSession();
    if (!savedSession) {
      setAuthReady(true);
      return;
    }
    let active = true;
    getManagementResource("/auth/me")
      .then((profile) => {
        const authenticatedUser = profile as StaffUser;
        if (active) {
          setSession({ access_token: savedSession.access_token, user: authenticatedUser });
          setPage(defaultPageForRole(authenticatedUser.role));
        }
      })
      .catch(() => {
        clearSession();
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      setSession(null);
      setPage("Overview");
      setAuthReady(true);
    }
    window.addEventListener("hoteru:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("hoteru:unauthorized", handleUnauthorized);
  }, []);

  const role = session?.user.role;
  const allowedPages = role ? pagesForRole(role) : [];
  const navigation = role ? navigationForRole(role) : [];
  const isManagement = managementPages.includes(page) && allowedPages.includes(page);
  const isOutlet = page === "Outlet";
  const isFrontDeskWorkspace = ["Overview", "Visitors", "Appointments", "History"].includes(page);
  useEffect(() => {
    if (role && !allowedPages.includes(page)) setPage(defaultPageForRole(role));
  }, [role, page]);

  useEffect(() => {
    if (!role || !["front_desk", "manager", "admin"].includes(role)) {
      setVisitors([]);
      setReservations([]);
      setRooms([]);
      setFrontDeskLoading(false);
      return;
    }
    let active = true;
    setFrontDeskLoading(true);
    Promise.all([getFrontDeskVisitors(), getReservations(), getRooms()])
      .then(([stays, nextReservations, nextRooms]) => {
        if (!active) return;
        setVisitors(stays.map(visitorFromStay));
        setReservations(nextReservations);
        setRooms(nextRooms);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Could not load front desk data.");
        }
      })
      .finally(() => {
        if (active) setFrontDeskLoading(false);
      });
    return () => { active = false; };
  }, [role, session?.access_token]);

  useEffect(() => {
    if (modal !== "reservation" || reservationCheckOut <= reservationCheckIn) {
      setAvailableRooms([]);
      setAvailabilityLoading(false);
      return;
    }
    let active = true;
    setAvailabilityLoading(true);
    getAvailableRooms(reservationCheckIn, reservationCheckOut)
      .then((nextRooms) => {
        if (!active) return;
        setAvailableRooms(nextRooms);
        if (!nextRooms.some((room) => room.room_code === selectedReservationRoom)) {
          setSelectedReservationRoom(nextRooms[0]?.room_code ?? "");
          setReservationRate(nextRooms[0] ? String(nextRooms[0].rate_minor) : "");
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Room availability could not be loaded.");
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });
    return () => { active = false; };
  }, [modal, reservationCheckIn, reservationCheckOut, selectedReservationRoom]);

  async function refreshFrontDeskData() {
    const [stays, nextReservations, nextRooms] = await Promise.all([
      getFrontDeskVisitors(),
      getReservations(),
      getRooms(),
    ]);
    setVisitors(stays.map(visitorFromStay));
    setReservations(nextReservations);
    setRooms(nextRooms);
  }

  function openReservationForm() {
    setReservationCheckIn(hotelDateToday());
    setReservationCheckOut(addHotelDays(hotelDateToday(), 1));
    setSelectedReservationRoom("");
    setReservationRate("");
    setModal("reservation");
  }

  function openCheckInForm() {
    setReservationCheckOut(addHotelDays(hotelDateToday(), 1));
    setModal("checkin");
  }

  async function cancelBooking(reservation: Reservation) {
    setError("");
    setNotice("");
    try {
      await cancelReservation(reservation.reservation_id);
      await refreshFrontDeskData();
      setNotice(`Reservation for ${reservation.guest_name} cancelled.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The reservation could not be cancelled.");
    }
  }

  async function registerRoom(payload: { room_code: string; room_type: string; rate_minor: number }) {
    setError("");
    setNotice("");
    try {
      await postManagementAction("/rooms", payload);
      await refreshFrontDeskData();
      setNotice(`Room ${payload.room_code} added to the room inventory.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The room could not be registered.");
    }
  }

  const filteredVisitors = useMemo(
    () => visitors.filter((visitor) =>
      `${visitor.name} ${visitor.company} ${visitor.room}`.toLowerCase().includes(query.toLowerCase()),
    ),
    [visitors, query],
  );
  const activeVisitors = useMemo(
    () => filteredVisitors.filter((visitor) => visitor.status === "Inside"),
    [filteredVisitors],
  );
  const todaysReservations = useMemo(
    () => reservations.filter((reservation) => reservation.check_in === hotelDateToday()),
    [reservations],
  );
  const today = new Intl.DateTimeFormat(UGANDA_LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: UGANDA_TIME_ZONE,
  }).format(new Date());
  if (!authReady) {
    return <main className="auth-loading"><span className="loading-indicator" />Verifying staff session…</main>;
  }

  if (!session) {
    return <LoginScreen onLogin={(nextSession) => {
      setSession(nextSession);
      setPage(defaultPageForRole(nextSession.user.role));
    }} />;
  }

  async function submitReceptionForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const guestName = String(form.get("guest_name") ?? "").trim();
    const roomCode = String(form.get("room_code") ?? "").trim();
    if (!guestName || !roomCode) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (modal === "checkin") {
        await checkInGuest(guestName, roomCode, String(form.get("check_out")));
        await refreshFrontDeskData();
        setNotice(`${guestName} checked in successfully.`);
      } else if (modal === "reservation") {
        const rate = Number(form.get("rate_minor"));
        await createReservation({
          guest_name: guestName,
          room_code: roomCode,
          check_in: reservationCheckIn,
          check_out: reservationCheckOut,
          rate_minor: Math.round(rate),
        });
        await refreshFrontDeskData();
        setNotice(`Reservation created for ${guestName}.`);
      } else if (modal === "checkout") {
        if (!checkoutVisitor) throw new Error("Select an active guest stay before checkout.");
        const cashPaid = Number(form.get("cash_paid_minor"));
        const paymentMethod = String(form.get("payment_method")) as "cash" | "mobile_money" | "card";
        await checkOutGuest(guestName, roomCode, cashPaid, paymentMethod);
        await refreshFrontDeskData();
        setNotice(`${guestName} checked out. Folio payment recorded.`);
      }
      setModal(null);
      setCheckoutVisitor(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function checkout(visitor: Visitor) {
    setError("");
    setNotice("");
    setCheckoutVisitor(visitor);
    setModal("checkout");
  }

  function changePage(nextPage: PageKind) {
    if (!allowedPages.includes(nextPage)) return;
    setPage(nextPage);
    setError("");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="#" aria-label="Hoteru home" onClick={() => changePage("Overview")}>
          <span className="brand-mark"><img src="/hoteru-logo.png" alt="" /></span>
          <span className="brand-name">hoteru<span>.</span></span>
        </a>
        <div className="nav-caption">{isManagement ? "MANAGEMENT" : "FRONT DESK"}</div>
        <nav className={`nav-list ${role === "manager" || role === "admin" ? "management-nav" : ""}`}>
          {navigation.map(([destination, icon]) => (
            <button
              aria-label={destination === "Overview" && (role === "admin" || role === "manager") ? "Front Desk" : destination}
              aria-current={page === destination ? "page" : undefined}
              className={`nav-item ${page === destination ? "active" : ""}`}
              key={destination}
              onClick={() => changePage(destination)}
              title={destination === "Overview" && (role === "admin" || role === "manager") ? "Front Desk" : destination}
            >
              <Icon name={icon} />
              <span>{destination === "Overview" && (role === "admin" || role === "manager") ? "Front Desk" : destination}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" aria-label="Settings" title="Settings">
            <Icon name="settings" /><span>Settings</span>
          </button>
          <div className="staff-card">
            <div className="avatar avatar-staff">AW</div>
            <div className="staff-details"><strong>{session.user.full_name}</strong><span>{session.user.role.replace("_", " ")}</span></div>
            <button className="staff-logout" onClick={() => { clearSession(); setSession(null); }} aria-label="Sign out">↗</button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Hoteru</span><Icon name="chevron" size={15} /><strong>{isManagement ? `Management / ${page}` : isOutlet ? `Outlet / ${page}` : `Front Desk / ${page}`}</strong></div>
          <div className="topbar-actions">
            <label className="search-box">
              <Icon name="search" size={18} />
              <input
                aria-label="Search guests and rooms"
                placeholder="Search guests, rooms..."
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </label>
            <button
              className="icon-button"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
            </button>
            <button className="icon-button notification-button" aria-label="Notifications">
              <Icon name="bell" size={19} /><span className="notification-dot" />
            </button>
            <button className="avatar avatar-top avatar-logout" onClick={() => { clearSession(); setSession(null); }} aria-label={`Sign out ${session.user.full_name}`} title="Sign out">{session.user.full_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</button>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="live-dot" /> {isManagement ? "GENERAL MANAGEMENT" : isOutlet ? "RESTAURANT & ROOM SERVICE" : "FRONT DESK"} <span className="eyebrow-divider">/</span> {today.toUpperCase()}</div>
              <h1>{page === "Overview" ? "Good morning, Alex" : page === "Management" ? "The whole operation, at a glance" : isOutlet ? "Restaurant sales" : page}</h1>
              <p className="heading-subtitle">
                {isManagement ? "Live operational and financial signals to guide today’s decisions." :
                  isOutlet ? "Serve walk-in diners and post in-house guest orders to their folios." :
                  page === "Overview" ? "Here’s what’s happening at The Meridian Kampala today." :
                  page === "Visitors" ? "A clear view of today’s arrivals and in-house guests." :
                    page === "Appointments" ? "Today’s arrivals, meetings, and scheduled visits." :
                      "Recent front desk activity at a glance."}
              </p>
            </div>
            {isFrontDeskWorkspace && !isManagement && <div className="heading-actions">
              <button className="button button-secondary" onClick={openReservationForm}>
                <Icon name="calendar" size={18} /> <span>New reservation</span>
              </button>
              <button className="button button-primary" onClick={openCheckInForm}>
                <Icon name="plus" size={19} /> <span>Check in</span>
              </button>
            </div>}
          </section>

          {notice && <div className="toast toast-success" role="status"><Icon name="check" size={17} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><Icon name="close" size={16} /></button></div>}
          {error && <div className="toast toast-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><Icon name="close" size={16} /></button></div>}

          {allowedPages.length === 0 ? <section className="panel management-panel"><EmptyMessage text="Your role does not have a workspace enabled yet. Ask an administrator to assign an available staff role." /></section> : isManagement ? <ManagementWorkspace page={page} userRole={session.user.role} currentUserEmail={session.user.email} onNotice={setNotice} onError={setError} /> : isOutlet ? <OutletWorkspace onNotice={setNotice} onError={setError} /> : page === "Overview" && <Overview
            visitors={visitors}
            activeVisitors={activeVisitors}
            reservations={reservations}
            todaysReservations={todaysReservations}
            loading={frontDeskLoading}
            onCheckIn={openCheckInForm}
            onCheckout={checkout}
            onViewVisitors={() => changePage("Visitors")}
            onViewAppointments={() => changePage("Appointments")}
          />}
          {page === "Visitors" && <VisitorPage visitors={activeVisitors} loading={frontDeskLoading} onCheckout={checkout} />}
          {page === "Appointments" && <AppointmentsPage
            reservations={reservations}
            rooms={rooms}
            loading={frontDeskLoading}
            canManageRooms={role === "manager" || role === "admin"}
            onReserve={openReservationForm}
            onCancel={cancelBooking}
            onCreateRoom={registerRoom}
          />}
          {page === "History" && <HistoryPage visitors={visitors} />}
        </div>
        <footer className="footer"><span><span className="live-dot" /> API connected</span><span>Hoteru {isManagement ? "Management" : isOutlet ? "Outlet" : "Front Desk"} <i>·</i> Live module data</span></footer>
      </main>

      {modal && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <section className="modal" aria-modal="true" role="dialog" aria-labelledby="modal-title">
            <div className="modal-header">
              <div className="modal-icon"><Icon name={modal === "checkin" ? "key" : modal === "checkout" ? "check" : "calendar"} /></div>
              <button className="icon-button" onClick={() => { setModal(null); setCheckoutVisitor(null); }} aria-label="Close"><Icon name="close" size={19} /></button>
            </div>
            <h2 id="modal-title">{modal === "checkin" ? "Check in a guest" : modal === "checkout" ? "Check out guest" : "New reservation"}</h2>
            <p className="modal-subtitle">{modal === "checkout" ? "Review the folio balance and record payment." : "A couple of details and you’re all set."}</p>
            <form onSubmit={submitReceptionForm}>
              {modal === "checkout" && checkoutVisitor ? (
                <>
                  <input type="hidden" name="guest_name" value={checkoutVisitor.name} />
                  <input type="hidden" name="room_code" value={checkoutVisitor.room} />
                  <div className="checkout-summary">
                    <strong>{checkoutVisitor.name} · Room {checkoutVisitor.room}</strong>
                    {checkoutVisitor.charges.map((charge, index) => (
                      <span key={`${charge.created_at}-${index}`}>
                        {charge.outlet.replace("_", " ")}: {amountLabel(charge.total_minor)}
                      </span>
                    ))}
                    <span>Folio balance: {amountLabel(checkoutVisitor.balanceMinor)}</span>
                    <span>Deposit available: {amountLabel(checkoutVisitor.depositMinor)}</span>
                    <strong>Payment due: {amountLabel(Math.max(0, checkoutVisitor.balanceMinor - checkoutVisitor.depositMinor))}</strong>
                    {checkoutVisitor.depositMinor > checkoutVisitor.balanceMinor && <span>Unused deposit to refund: {amountLabel(checkoutVisitor.depositMinor - checkoutVisitor.balanceMinor)}</span>}
                  </div>
                  <label className="field-label" htmlFor="cash_paid_minor">Amount to collect <span className="field-hint">UGX</span></label>
                  <input
                    autoFocus
                    className="form-input"
                    id="cash_paid_minor"
                    name="cash_paid_minor"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={Math.max(0, checkoutVisitor.balanceMinor - checkoutVisitor.depositMinor)}
                    required
                  />
                  <label className="field-label" htmlFor="checkout_payment_method">Payment method</label>
                  <select className="form-input" id="checkout_payment_method" name="payment_method" defaultValue="cash">
                    <option value="cash">Cash</option>
                    <option value="mobile_money">Mobile money</option>
                    <option value="card">Card</option>
                  </select>
                </>
              ) : (
                <>
                  <label className="field-label" htmlFor="guest_name">Guest name</label>
                  <input autoFocus className="form-input" id="guest_name" name="guest_name" placeholder="e.g. Jane Nakato" required />
                  <label className="field-label" htmlFor="room_code">{modal === "reservation" ? "Available room" : "Room number"}</label>
                  {modal === "reservation" ? (
                    <select
                      className="form-input"
                      id="room_code"
                      name="room_code"
                      value={selectedReservationRoom}
                      onChange={(event) => {
                        const room = availableRooms.find((item) => item.room_code === event.target.value);
                        setSelectedReservationRoom(event.target.value);
                        if (room) setReservationRate(String(room.rate_minor));
                      }}
                      required
                      disabled={availabilityLoading || availableRooms.length === 0}
                    >
                      <option value="">{availabilityLoading ? "Checking availability…" : "Select available room"}</option>
                      {availableRooms.map((room) => (
                        <option value={room.room_code} key={room.room_code}>
                          {room.room_code} · {room.room_type} · {amountLabel(room.rate_minor)} / night
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select className="form-input" id="room_code" name="room_code" required defaultValue="">
                      <option value="">Select available room</option>
                      {rooms.filter((room) => room.status === "available").map((room) => (
                        <option value={room.room_code} key={room.room_code}>{room.room_code} · {room.room_type}</option>
                      ))}
                    </select>
                  )}
                  {modal === "checkin" && (
                    <>
                      <label className="field-label" htmlFor="check_out">Expected check-out</label>
                      <input
                        className="form-input"
                        id="check_out"
                        name="check_out"
                        type="date"
                        min={addHotelDays(hotelDateToday(), 1)}
                        value={reservationCheckOut}
                        onChange={(event) => setReservationCheckOut(event.target.value)}
                        required
                      />
                    </>
                  )}
                </>
              )}
              {modal === "reservation" && (
                <>
                  <div className="form-row">
                    <div><label className="field-label" htmlFor="check_in">Check in</label><input className="form-input" id="check_in" name="check_in" type="date" min={hotelDateToday()} value={reservationCheckIn} onChange={(event) => setReservationCheckIn(event.target.value)} required /></div>
                    <div><label className="field-label" htmlFor="check_out">Check out</label><input className="form-input" id="check_out" name="check_out" type="date" min={addHotelDays(reservationCheckIn, 1)} value={reservationCheckOut} onChange={(event) => setReservationCheckOut(event.target.value)} required /></div>
                  </div>
                  <label className="field-label" htmlFor="rate">Nightly rate <span className="field-hint">UGX</span></label>
                  <input className="form-input" id="rate" name="rate_minor" type="number" min="1" step="1" value={reservationRate} onChange={(event) => setReservationRate(event.target.value)} required />
                  {!availabilityLoading && availableRooms.length === 0 && <p className="live-data-note">No rooms are available for those dates. Choose a different date range or ask a manager to add rooms.</p>}
                </>
              )}
              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => { setModal(null); setCheckoutVisitor(null); }}>Cancel</button>
                <button type="submit" className="button button-primary" disabled={busy}>
                  <Icon name={modal === "checkin" ? "key" : modal === "checkout" ? "check" : "calendar"} size={18} />
                  {busy ? "Saving..." : modal === "checkin" ? "Confirm check-in" : modal === "checkout" ? "Complete checkout" : "Create reservation"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await loginStaff(email, password));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-brand"><span className="brand-mark"><img src="/hoteru-logo.png" alt="" /></span><span>hoteru<span>.</span></span></div>
        <div className="login-eyebrow"><span className="live-dot" /> STAFF PORTAL</div>
        <h1>Welcome back</h1>
        <p className="login-description">Sign in with your staff account to open your workspace.</p>
        {error && <div className="login-error" role="alert">{error}</div>}
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="login-email">Work email</label>
          <input className="form-input" id="login-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
          <label className="field-label" htmlFor="login-password">Password</label>
          <input className="form-input" id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button className="button button-primary login-submit" type="submit" disabled={busy}><Icon name="key" size={18} />{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <div className="login-footer">Your access is based on your assigned staff role.</div>
      </section>
    </main>
  );
}

type ManagementRecord = Record<string, unknown>;
type FormField = {
  name: string;
  label: string;
  type?: "text" | "number" | "email";
  min?: number;
  defaultValue?: string;
  optional?: boolean;
  placeholder?: string;
};
type ManagementAction = {
  title: string;
  description: string;
  path: string;
  fields: FormField[];
  success: string;
};

function recordOf(value: unknown): ManagementRecord {
  return value && typeof value === "object" ? value as ManagementRecord : {};
}

function rowsOf(value: unknown, key: string): ManagementRecord[] {
  const rows = recordOf(value)[key];
  return Array.isArray(rows) ? rows.map(recordOf) : [];
}

function amountLabel(value: unknown, currency = UGANDA_CURRENCY) {
  const amount = typeof value === "number" ? value / (currency === "UGX" ? 1 : 100) : 0;
  return new Intl.NumberFormat(UGANDA_LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function OutletWorkspace({
  onNotice,
  onError,
}: {
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [folios, setFolios] = useState<ManagementRecord[]>([]);
  const [sales, setSales] = useState<ManagementRecord[]>([]);
  const [outlet, setOutlet] = useState<"restaurant" | "room_service">("restaurant");
  const [chargeToRoom, setChargeToRoom] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isRoomCharge = outlet === "room_service" || chargeToRoom;

  async function refreshSales() {
    const [folioResponse, salesResponse] = await Promise.all([
      getManagementResource("/outlets/active-folios"),
      getManagementResource("/outlets/sales"),
    ]);
    setFolios(rowsOf(folioResponse, "folios"));
    setSales(rowsOf(salesResponse, "sales"));
  }

  useEffect(() => {
    let active = true;
    refreshSales()
      .catch((loadError: unknown) => {
        if (active) onError(loadError instanceof Error ? loadError.message : "Outlet data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const total = Number(form.get("total_minor"));
    const cost = Number(form.get("cost_minor"));
    const paymentMethod = String(form.get("payment_method"));
    if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(cost) || cost < 0) {
      onError("Enter a valid sale total and cost in whole UGX.");
      return;
    }
    if (isRoomCharge && !roomCode) {
      onError("Select an occupied guest room to charge this order.");
      return;
    }
    if (!isRoomCharge && !["cash", "mobile_money", "card"].includes(paymentMethod)) {
      onError("Select a valid payment method.");
      return;
    }

    setSaving(true);
    onError("");
    try {
      await postManagementAction("/outlets/sales", {
        outlet,
        total_minor: total,
        cost_minor: cost,
        ...(isRoomCharge ? { room_code: roomCode } : { payment_method: paymentMethod }),
      });
      await refreshSales();
      onNotice(isRoomCharge ? "Guest order posted to the room folio." : "Walk-in sale recorded and payment taken.");
      formElement.reset();
      setChargeToRoom(false);
      setRoomCode("");
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "The outlet sale could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="management-loading"><span className="loading-indicator" />Loading outlet data…</div>;

  return (
    <div className="management-grid">
      <section className="panel management-panel">
        <div className="panel-heading"><div><h2>Record a sale</h2><p>Restaurant walk-ins pay at the outlet; in-house orders can go to a room folio.</p></div></div>
        <form className="action-form" onSubmit={submitSale}>
          <label className="action-field">
            <span>Service</span>
            <select
              className="form-input"
              name="outlet"
              value={outlet}
              onChange={(event) => {
                const nextOutlet = event.target.value === "room_service" ? "room_service" : "restaurant";
                setOutlet(nextOutlet);
                setChargeToRoom(nextOutlet === "room_service");
                setRoomCode("");
              }}
            >
              <option value="restaurant">Restaurant</option>
              <option value="room_service">Room service</option>
            </select>
          </label>
          {outlet === "restaurant" && (
            <label className="action-field outlet-check-row">
              <span>Charge to an in-house guest room?</span>
              <input type="checkbox" checked={chargeToRoom} onChange={(event) => setChargeToRoom(event.target.checked)} />
            </label>
          )}
          {isRoomCharge ? (
            <label className="action-field">
              <span>Guest and room</span>
              <select className="form-input" value={roomCode} onChange={(event) => setRoomCode(event.target.value)} required>
                <option value="">Select an occupied room</option>
                {folios.map((folio) => (
                  <option key={String(folio.room_code)} value={String(folio.room_code)}>
                    {String(folio.guest_name)} · Room {String(folio.room_code)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="action-field">
              <span>Payment method</span>
              <select className="form-input" name="payment_method" defaultValue="cash">
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile money</option>
                <option value="card">Card</option>
              </select>
            </label>
          )}
          <label className="action-field"><span>Sale total (UGX)</span><input className="form-input" name="total_minor" type="number" min="1" step="1" required /></label>
          <label className="action-field"><span>Cost of sale (UGX)</span><input className="form-input" name="cost_minor" type="number" min="0" step="1" defaultValue="0" required /></label>
          <button className="button button-primary" type="submit" disabled={saving || (isRoomCharge && folios.length === 0)}>
            <Icon name="check" size={18} />{saving ? "Recording sale…" : isRoomCharge ? "Post to guest folio" : "Record walk-in payment"}
          </button>
          {isRoomCharge && folios.length === 0 && <p className="live-data-note">There are no occupied rooms to charge yet.</p>}
        </form>
      </section>
      <section className="panel management-panel">
        <div className="panel-heading"><div><h2>Recent outlet sales</h2><p>Recorded walk-in payments and room charges</p></div><span className="count-pill">{sales.length}</span></div>
        <div className="management-record-list">
          {sales.length ? sales.slice(0, 12).map((sale, index) => {
            const isRoom = typeof sale.room_code === "string" && sale.room_code.length > 0;
            return (
              <div className="management-record" key={`${String(sale.created_at)}-${index}`}>
                <span className="record-icon"><Icon name={isRoom ? "building" : "check"} size={17} /></span>
                <div>
                  <strong>{String(sale.outlet).replace("_", " ")} · {amountLabel(sale.total_minor)}</strong>
                  <small>{isRoom ? `${String(sale.guest_name)} · Room ${String(sale.room_code)} · Folio` : `Walk-in · ${String(sale.payment_method ?? "cash")}`}</small>
                </div>
                <span className={`status-badge ${isRoom ? "inside" : "checked-out"}`}><span />{isRoom ? "Room charge" : "Paid"}</span>
              </div>
            );
          }) : <EmptyMessage text="Sales will appear here after they are recorded." />}
        </div>
      </section>
    </div>
  );
}

function endpointForManagementPage(page: PageKind, role: StaffRole): string[] {
  if (page === "Management") return ["/management/overview"];
  if (page === "Operations") return ["/management/operations"];
  if (page === "People") return ["/management/people"];
  if (page === "Finance") {
    const endpoints = ["/reports/statement", "/reports/trial-balance", "/finance/period"];
    if (role === "manager" || role === "admin") endpoints.push("/management/overview");
    return endpoints;
  }
  if (page === "Reports") {
    return ["/reports/statement", "/reports/trial-balance"];
  }
  if (page === "Approvals") return ["/management/approvals"];
  if (page === "Resources") {
    if (role === "admin" || role === "manager" || role === "accountant") {
      return ["/inventory", "/assets", "/procurement/purchase-orders"];
    }
    if (role === "storekeeper") return ["/inventory"];
    if (role === "procurement") return ["/procurement/purchase-orders"];
  }
  return [];
}

type ReportCategory = "Performance" | "Finance" | "People" | "Operations";
type ReportRange = "All time" | "Today" | "Week" | "Month" | "Custom";

function localDateString(value: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: UGANDA_TIME_ZONE,
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function reportEndpoints(
  category: ReportCategory,
  range: ReportRange,
  customStart: string,
  customEnd: string,
  role: StaffRole,
): string[] {
  if (category === "People") return ["/management/people"];
  if (category === "Operations") return ["/management/operations"];
  if (category === "Performance") {
    return role === "admin" || role === "manager"
      ? ["/management/overview", "/management/operations"]
      : ["/management/overview"];
  }
  const now = new Date();
  let start = "";
  let end = "";
  if (range === "Today") start = end = localDateString(now);
  if (range === "Week") {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    start = localDateString(monday);
    end = localDateString(now);
  }
  if (range === "Month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    start = localDateString(first);
    end = localDateString(now);
  }
  if (range === "Custom") {
    start = customStart;
    end = customEnd;
  }
  const query = new URLSearchParams();
  if (start) query.set("start_date", start);
  if (end) query.set("end_date", end);
  const suffix = query.size ? `?${query.toString()}` : "";
  return [`/reports/statement${suffix}`, `/reports/trial-balance${suffix}`];
}

const resourceActions: ManagementAction[] = [
  {
    title: "Create purchase order",
    description: "Submit an order to the approval inbox.",
    path: "/procurement/purchase-orders",
    fields: [
      { name: "po_number", label: "PO number" },
      { name: "supplier_name", label: "Supplier" },
      { name: "total_minor", label: "Total (UGX)", type: "number", min: 1 },
    ],
    success: "Purchase order sent for approval.",
  },
  {
    title: "Receive goods",
    description: "Record a goods receipt against an order.",
    path: "/procurement/goods-receipts",
    fields: [
      { name: "po_number", label: "PO number" },
      { name: "quantity", label: "Quantity", type: "number", min: 1 },
      { name: "unit_cost_minor", label: "Unit cost (UGX)", type: "number", min: 1 },
    ],
    success: "Goods receipt recorded.",
  },
  {
    title: "Match supplier invoice",
    description: "Match an invoice and post it to the ledger.",
    path: "/procurement/invoices",
    fields: [
      { name: "invoice_number", label: "Invoice number" },
      { name: "supplier_name", label: "Supplier" },
      { name: "total_minor", label: "Total (UGX)", type: "number", min: 1 },
    ],
    success: "Supplier invoice matched.",
  },
  {
    title: "Release supplier payment",
    description: "Pay a matched invoice as an authorized role.",
    path: "/procurement/invoices/{invoice_number}/payment",
    fields: [{ name: "invoice_number", label: "Invoice number" }],
    success: "Supplier payment released.",
  },
  {
    title: "Add stock item",
    description: "Create an item in the inventory register.",
    path: "/inventory/items",
    fields: [
      { name: "sku", label: "SKU" },
      { name: "name", label: "Item name" },
      { name: "unit_cost_minor", label: "Unit cost (UGX)", type: "number", min: 1 },
      { name: "store_code", label: "Store", defaultValue: "main" },
    ],
    success: "Inventory item added.",
  },
  {
    title: "Receive stock",
    description: "Increase on-hand quantity and update inventory value.",
    path: "/inventory/receipts",
    fields: [
      { name: "sku", label: "SKU" },
      { name: "quantity", label: "Quantity", type: "number", min: 1 },
    ],
    success: "Stock receipt recorded.",
  },
  {
    title: "Deplete stock",
    description: "Record stock usage and its cost of sales.",
    path: "/inventory/depletions",
    fields: [
      { name: "sku", label: "SKU" },
      { name: "quantity", label: "Quantity", type: "number", min: 1 },
    ],
    success: "Stock depletion recorded.",
  },
  {
    title: "Run payroll",
    description: "Post a payroll run to the general ledger.",
    path: "/hr/payroll",
    fields: [
      { name: "period", label: "Payroll period", placeholder: "2026-10" },
      { name: "total_minor", label: "Total (UGX)", type: "number", min: 1 },
    ],
    success: "Payroll run posted.",
  },
  {
    title: "Register fixed asset",
    description: "Add a fixed asset to the register.",
    path: "/assets",
    fields: [
      { name: "asset_code", label: "Asset code" },
      { name: "name", label: "Asset name" },
      { name: "cost_minor", label: "Cost (UGX)", type: "number", min: 1 },
      { name: "useful_life_months", label: "Useful life (months)", type: "number", min: 1 },
    ],
    success: "Fixed asset registered.",
  },
  {
    title: "Run depreciation",
    description: "Post a monthly depreciation amount for an asset.",
    path: "/assets/{asset_code}/depreciation",
    fields: [
      { name: "asset_code", label: "Asset code" },
      { name: "amount_minor", label: "Amount (UGX)", type: "number", min: 1 },
    ],
    success: "Asset depreciation posted.",
  },
  {
    title: "Post night-audit charge",
    description: "Post a room charge for the night audit.",
    path: "/front-desk/night-audit/charges",
    fields: [
      { name: "room_code", label: "Room" },
      { name: "guest_name", label: "Guest name" },
      { name: "charge_minor", label: "Charge (UGX)", type: "number", min: 1 },
    ],
    success: "Night-audit charge posted.",
  },
  {
    title: "Reconcile night audit",
    description: "Compare till cash with folio totals.",
    path: "/front-desk/night-audit/reconcile",
    fields: [
      { name: "till_cash_minor", label: "Till cash (UGX)", type: "number", min: 0 },
      { name: "folio_total_minor", label: "Folio total (UGX)", type: "number", min: 0 },
    ],
    success: "Night-audit reconciliation complete.",
  },
];

function actionsForRole(role: StaffRole): ManagementAction[] {
  const allowedTitles: Partial<Record<StaffRole, string[]>> = {
    manager: resourceActions.map((action) => action.title),
    admin: resourceActions.map((action) => action.title),
    accountant: [
      "Match supplier invoice",
      "Release supplier payment",
      "Run payroll",
      "Register fixed asset",
      "Run depreciation",
      "Post night-audit charge",
      "Reconcile night audit",
    ],
    procurement: ["Create purchase order", "Receive goods", "Match supplier invoice"],
    storekeeper: ["Receive goods", "Add stock item", "Receive stock", "Deplete stock"],
  };
  const titles = allowedTitles[role] ?? [];
  return resourceActions.filter((action) => titles.includes(action.title));
}

function ManagementWorkspace({
  page,
  userRole,
  currentUserEmail,
  onNotice,
  onError,
}: {
  page: PageKind;
  userRole: StaffRole;
  currentUserEmail: string;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [pendingApproval, setPendingApproval] = useState("");
  const [reportCategory, setReportCategory] = useState<ReportCategory>(userRole === "accountant" ? "Finance" : "Performance");
  const [reportRange, setReportRange] = useState<ReportRange>("Month");
  const [customStart, setCustomStart] = useState(localDateString(new Date()));
  const [customEnd, setCustomEnd] = useState(localDateString(new Date()));
  const paths = page === "Reports"
    ? reportEndpoints(reportCategory, reportRange, customStart, customEnd, userRole)
    : endpointForManagementPage(page, userRole);
  const pathsKey = paths.join("|");

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all(paths.map((path) => getManagementResource(path)))
      .then((results) => {
        if (active) setData(results);
      })
      .catch((requestError: unknown) => {
        if (active) onError(requestError instanceof Error ? requestError.message : "Management data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [page, refreshVersion, pathsKey]);

  async function submitAction(action: ManagementAction, payload: ManagementRecord) {
    onError("");
    try {
      const path = action.path
        .replace("{invoice_number}", encodeURIComponent(String(payload.invoice_number ?? "")))
        .replace("{asset_code}", encodeURIComponent(String(payload.asset_code ?? "")));
      const body = { ...payload };
      if (action.path.includes("/payment")) delete body.invoice_number;
      if (action.path.includes("/depreciation")) delete body.asset_code;
      if (body.room_code === "") delete body.room_code;
      await postManagementAction(path, body);
      onNotice(action.success);
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "The management action could not be completed.");
    }
  }

  async function approveOrder(poNumber: string) {
    setPendingApproval(poNumber);
    onError("");
    try {
      await postManagementAction(`/management/approvals/${encodeURIComponent(poNumber)}/approve`, {});
      onNotice(`${poNumber} approved.`);
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "Approval could not be completed.");
    } finally {
      setPendingApproval("");
    }
  }

  async function closeFiscalPeriod() {
    if (!window.confirm("Close this fiscal period? Further ledger postings will be rejected.")) return;
    onError("");
    try {
      await postManagementAction("/finance/period/close", {});
      onNotice("Fiscal period closed. Further ledger postings are now locked.");
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "The fiscal period could not be closed.");
    }
  }

  async function createStaffAccount(payload: ManagementRecord) {
    onError("");
    try {
      await postManagementAction("/auth/staff", payload);
      onNotice("Staff account created.");
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "Staff account could not be created.");
    }
  }

  if (loading) return <div className="management-loading"><span className="loading-indicator" />Loading live management data…</div>;
  const first = recordOf(data[0]);
  const overview = page === "Finance" || page === "Reports" ? recordOf(data[2]) : first;
  const currency = String(overview.currency ?? UGANDA_CURRENCY);

  return (
    <div className="management-workspace">
      {page === "Management" && <ManagementOverview data={first} currency={currency} />}
      {page === "Operations" && <ManagementOperations data={first} />}
      {page === "People" && <ManagementPeople data={first} userRole={userRole} onCreateStaff={createStaffAccount} />}
      {page === "Finance" && <ManagementFinance data={data} currency={currency} reports={false} period={recordOf(data[3])} onClosePeriod={userRole === "manager" || userRole === "admin" ? closeFiscalPeriod : undefined} />}
      {page === "Reports" && (
        <ManagementReports
          category={reportCategory}
          range={reportRange}
          userRole={userRole}
          onCreateStaff={createStaffAccount}
          customStart={customStart}
          customEnd={customEnd}
          onCategory={setReportCategory}
          onRange={setReportRange}
          onCustomStart={setCustomStart}
          onCustomEnd={setCustomEnd}
          data={data}
          currency={currency}
        />
      )}
      {page === "Approvals" && <ManagementApprovals data={first} pending={pendingApproval} currentUserEmail={currentUserEmail} onApprove={approveOrder} />}
      {page === "Resources" && (
        <ManagementResources
          inventory={recordOf(data[paths.indexOf("/inventory")])}
          assets={recordOf(data[paths.indexOf("/assets")])}
          procurement={recordOf(data[paths.indexOf("/procurement/purchase-orders")])}
          userRole={userRole}
          onSubmit={submitAction}
        />
      )}
    </div>
  );
}

function ManagementOverview({ data, currency }: { data: ManagementRecord; currency: string }) {
  const metrics = [
    { label: "Revenue", value: amountLabel(data.revenue_minor, currency), delta: "Ledger to date", icon: "sparkle" as const, tone: "teal" },
    { label: "Expenses", value: amountLabel(data.expenses_minor, currency), delta: "Ledger to date", icon: "clock" as const, tone: "amber" },
    { label: "Occupancy", value: `${Number(data.occupancy_percent ?? 0)}%`, delta: `${data.occupied_rooms ?? 0} / ${data.total_rooms ?? 0} rooms`, icon: "building" as const, tone: "navy" },
    { label: "Alerts", value: String(data.alerts ?? 0).padStart(2, "0"), delta: "Pending approvals", icon: "bell" as const, tone: "amber" },
  ];
  const revenue = typeof data.revenue_minor === "number" ? Math.abs(data.revenue_minor) : 0;
  const expenses = typeof data.expenses_minor === "number" ? Math.abs(data.expenses_minor) : 0;
  const max = Math.max(revenue, expenses, 1);
  return (
    <>
      <div className="management-stats">
        {metrics.map((metric) => <article className="stat-card management-stat" key={metric.label}>
          <div className="stat-top"><span className={`stat-icon ${metric.tone}`}><Icon name={metric.icon} /></span></div>
          <div className="stat-value">{metric.value}</div>
          <div className="stat-bottom"><span>{metric.label}</span><small>{metric.delta}</small></div>
        </article>)}
      </div>
      <div className="management-grid">
        <section className="panel management-panel">
          <div className="panel-heading"><div><h2>Financial pulse</h2><p>Posted totals from the general ledger</p></div><span className="today-pill">{currency}</span></div>
          <div className="finance-bars">
            <div className="finance-bar-row"><span>Revenue</span><div className="finance-bar-track"><i style={{ width: `${Math.max(3, revenue / max * 100)}%` }} /></div><strong>{amountLabel(revenue, currency)}</strong></div>
            <div className="finance-bar-row expenses"><span>Expenses</span><div className="finance-bar-track"><i style={{ width: `${Math.max(3, expenses / max * 100)}%` }} /></div><strong>{amountLabel(expenses, currency)}</strong></div>
          </div>
          <div className="net-result"><span>Net result</span><strong>{amountLabel(data.net_profit_minor, currency)}</strong></div>
        </section>
        <section className="panel management-panel">
          <div className="panel-heading"><div><h2>People & approvals</h2><p>Operational signals from live modules</p></div></div>
          <div className="signal-grid">
            <div className="signal-item"><span className="stat-icon teal"><Icon name="users" /></span><div><strong>{String(data.active_visitors ?? 0)}</strong><small>Active stays</small></div></div>
            <div className="signal-item"><span className="stat-icon navy"><Icon name="calendar" /></span><div><strong>{String(data.appointments ?? 0)}</strong><small>Reservations</small></div></div>
            <div className="signal-item"><span className="stat-icon blue"><Icon name="users" /></span><div><strong>{String(data.active_staff ?? 0)}</strong><small>Active staff</small></div></div>
            <div className="signal-item"><span className="stat-icon amber"><Icon name="bell" /></span><div><strong>{String(data.pending_approvals ?? 0)}</strong><small>To approve</small></div></div>
          </div>
        </section>
      </div>
      <p className="live-data-note">Revenue, expenses, occupancy, stays, reservations, staff, and approvals are read from backend services. Empty modules show zero until activity is recorded.</p>
    </>
  );
}

function ManagementOperations({ data }: { data: ManagementRecord }) {
  const rooms = rowsOf(data, "rooms");
  const stays = rowsOf(data, "open_folios");
  const reservations = rowsOf(data, "reservations");
  const orders = rowsOf(data, "pending_purchase_orders");
  const lowStock = rowsOf(data, "low_stock_items");
  const operations = [
    { label: "Rooms", count: rooms.length, detail: `${rooms.filter((room) => room.status === "occupied").length} occupied`, tone: "teal" },
    { label: "Open stays", count: stays.length, detail: "Guest folios open", tone: "teal" },
    { label: "Reservations", count: reservations.length, detail: "Recorded bookings", tone: "navy" },
    { label: "Needs attention", count: orders.length + lowStock.length, detail: `${orders.length} approvals · ${lowStock.length} stock alerts`, tone: orders.length + lowStock.length ? "amber" : "teal" },
  ];
  return (
    <>
      <div className="management-stats">
        {operations.map((operation) => <article className="stat-card management-stat" key={operation.label}>
          <div className="stat-top"><span className={`stat-icon ${operation.tone}`}><Icon name={operation.label === "Rooms" ? "building" : operation.label === "Reservations" ? "calendar" : operation.label === "Open stays" ? "users" : "bell"} /></span></div>
          <div className="stat-value">{operation.count}</div><div className="stat-bottom"><span>{operation.label}</span><small>{operation.detail}</small></div>
        </article>)}
      </div>
      <div className="management-grid">
        <section className="panel management-panel"><div className="panel-heading"><div><h2>Room status</h2><p>Availability from active front-desk inventory</p></div></div>
          <div className="management-record-list">{rooms.length ? rooms.map((room) => <div className="management-record" key={String(room.room_code)}><span className="record-icon"><Icon name="building" size={17} /></span><div><strong>Room {String(room.room_code)}</strong><small>{String(room.room_type)}</small></div><span className={`status-badge ${room.status === "occupied" ? "inside" : "checked-out"}`}><span />{String(room.status)}</span></div>) : <EmptyMessage text="No rooms have been registered yet." />}</div>
        </section>
        <section className="panel management-panel"><div className="panel-heading"><div><h2>Attention queue</h2><p>Items that may need a manager</p></div></div>
          <div className="management-record-list">
            {orders.map((order) => <div className="management-record" key={String(order.po_number)}><span className="record-icon warning"><Icon name="bell" size={17} /></span><div><strong>{String(order.po_number)} · {String(order.supplier_name)}</strong><small>Purchase order awaiting approval</small></div><span className="status-badge waiting"><span />Review</span></div>)}
            {lowStock.map((item) => <div className="management-record" key={String(item.sku)}><span className="record-icon warning"><Icon name="building" size={17} /></span><div><strong>{String(item.name)}</strong><small>{String(item.sku)} · stock depleted</small></div><span className="status-badge waiting"><span />Restock</span></div>)}
            {!orders.length && !lowStock.length && <EmptyMessage text="No active operational alerts." />}
          </div>
        </section>
      </div>
    </>
  );
}

function ManagementPeople({
  data,
  userRole,
  onCreateStaff,
}: {
  data: ManagementRecord;
  userRole: StaffRole;
  onCreateStaff: (payload: ManagementRecord) => void;
}) {
  const staff = rowsOf(data, "staff");
  const payrollRuns = rowsOf(data, "payroll_runs");
  return (
    <div className="management-grid">
      <section className="panel management-panel"><div className="panel-heading"><div><h2>Team</h2><p>Staff directory and account status</p></div><span className="count-pill">{staff.length}</span></div>
        <div className="management-record-list">{staff.length ? staff.map((person) => {
          const name = String(person.full_name ?? person.email ?? "Staff member");
          const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
          return <div className="management-record staff-record" key={String(person.email)}><span className="avatar guest-avatar avatar-1">{initials}</span><div><strong>{name}</strong><small>{String(person.email)} · {String(person.role)}</small></div><span className={`status-badge ${person.status === "active" ? "inside" : "checked-out"}`}><span />{String(person.status)}</span></div>;
        }) : <EmptyMessage text="Staff profiles will appear here when created." />}</div>
      </section>
      <section className="panel management-panel"><div className="panel-heading"><div><h2>Payroll activity</h2><p>Posted payroll runs</p></div><span className="count-pill">{payrollRuns.length}</span></div>
        <div className="management-record-list">{payrollRuns.length ? payrollRuns.map((run) => <div className="management-record" key={String(run.period)}><span className="record-icon"><Icon name="calendar" size={17} /></span><div><strong>{String(run.period)}</strong><small>{amountLabel(run.total_minor)} · Payroll</small></div><span className="status-badge inside"><span />{String(run.status)}</span></div>) : <EmptyMessage text="No payroll runs have been posted." />}</div>
      </section>
      {userRole === "admin" && <StaffAccountForm onSubmit={onCreateStaff} />}
      <p className="live-data-note wide-note">Staff attendance is not currently implemented by the backend. This view reports staff account status and posted payroll only.</p>
    </div>
  );
}

function StaffAccountForm({ onSubmit }: { onSubmit: (payload: ManagementRecord) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      full_name: String(form.get("full_name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
      role: String(form.get("role")),
    });
    event.currentTarget.reset();
  }
  return (
    <section className="panel management-panel staff-create-panel">
      <div className="panel-heading"><div><h2>Create staff account</h2><p>Assign each person to a separate work area.</p></div><span className="today-pill">Admin only</span></div>
      <form className="staff-create-form" onSubmit={submit}>
        <label className="action-field"><span>Full name</span><input className="form-input" name="full_name" required /></label>
        <label className="action-field"><span>Work email</span><input className="form-input" name="email" type="email" autoComplete="off" required /></label>
        <label className="action-field"><span>Temporary password (12+ characters)</span><input className="form-input" name="password" type="password" minLength={12} autoComplete="new-password" required /></label>
        <label className="action-field"><span>Role</span><select className="form-input" name="role" required><option value="front_desk">Front Desk</option><option value="manager">Manager</option><option value="accountant">Accountant</option><option value="procurement">Procurement</option><option value="storekeeper">Storekeeper</option><option value="outlet_cashier">Outlet Cashier</option><option value="housekeeping">Housekeeping</option><option value="admin">Administrator</option></select></label>
        <button className="button button-primary button-small" type="submit"><Icon name="plus" size={16} />Create account</button>
      </form>
    </section>
  );
}

function ManagementReports({
  category,
  range,
  userRole,
  onCreateStaff,
  customStart,
  customEnd,
  onCategory,
  onRange,
  onCustomStart,
  onCustomEnd,
  data,
  currency,
}: {
  category: ReportCategory;
  range: ReportRange;
  userRole: StaffRole;
  onCreateStaff: (payload: ManagementRecord) => void;
  customStart: string;
  customEnd: string;
  onCategory: (category: ReportCategory) => void;
  onRange: (range: ReportRange) => void;
  onCustomStart: (date: string) => void;
  onCustomEnd: (date: string) => void;
  data: unknown[];
  currency: string;
}) {
  const categories: ReportCategory[] = userRole === "accountant"
    ? ["Finance"]
    : ["Performance", "Finance", "People", "Operations"];
  return (
    <>
      <section className="report-toolbar">
        <div className="report-categories" role="group" aria-label="Report category">
          {categories.map((item) =>
            <button className={`report-category ${category === item ? "selected" : ""}`} key={item} onClick={() => onCategory(item)}>{item}</button>,
          )}
        </div>
        {category === "Finance" && (
          <div className="report-date-tools">
            <div className="report-ranges" role="group" aria-label="Report date range">
              {(["Today", "Week", "Month", "Custom", "All time"] as const).map((item) =>
                <button className={`range-button ${range === item ? "selected" : ""}`} key={item} onClick={() => onRange(item)}>{item}</button>,
              )}
            </div>
            {range === "Custom" && <div className="custom-range"><label>From<input aria-label="Report start date" type="date" value={customStart} onChange={(event) => onCustomStart(event.target.value)} /></label><label>To<input aria-label="Report end date" type="date" value={customEnd} onChange={(event) => onCustomEnd(event.target.value)} /></label></div>}
          </div>
        )}
      </section>
      {category === "Performance" && <ManagementOverview data={recordOf(data[0])} currency={currency} />}
      {category === "Finance" && <ManagementFinance data={data} currency={currency} reports />}
      {category === "People" && <ManagementPeople data={recordOf(data[0])} userRole={userRole} onCreateStaff={onCreateStaff} />}
      {category === "Operations" && <ManagementOperations data={recordOf(data[0])} />}
    </>
  );
}

function ManagementFinance({
  data,
  currency,
  reports,
  period,
  onClosePeriod,
}: {
  data: unknown[];
  currency: string;
  reports: boolean;
  period?: ManagementRecord;
  onClosePeriod?: () => void;
}) {
  const statement = recordOf(data[0]).income_statement;
  const trialBalance = recordOf(data[1]).trial_balance;
  const balanceSheet = recordOf(data[1]).balance_sheet;
  const statementRecord = recordOf(statement);
  const accounts = Object.entries(recordOf(trialBalance));
  function exportReport() {
    const rows = [["Account", `Balance (${currency})`], ...accounts.map(([account, balance]) => [account, String(balance)])];
    rows.push(["Revenue", String(statementRecord.revenue ?? 0)], ["Expenses", String(statementRecord.expenses ?? 0)], ["Net profit", String(statementRecord.net_profit ?? 0)]);
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const file = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hoteru-${reports ? "management-report" : "finance"}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const revenue = Math.abs(Number(statementRecord.revenue ?? 0));
  const expenses = Math.abs(Number(statementRecord.expenses ?? 0));
  return (
    <>
      <div className="management-stats finance-summary">
        <article className="stat-card management-stat"><div className="stat-top"><span className="stat-icon teal"><Icon name="sparkle" /></span></div><div className="stat-value">{amountLabel(revenue, currency)}</div><div className="stat-bottom"><span>Revenue</span><small>Posted to ledger</small></div></article>
        <article className="stat-card management-stat"><div className="stat-top"><span className="stat-icon amber"><Icon name="clock" /></span></div><div className="stat-value">{amountLabel(expenses, currency)}</div><div className="stat-bottom"><span>Expenses</span><small>Posted to ledger</small></div></article>
        <article className="stat-card management-stat"><div className="stat-top"><span className="stat-icon navy"><Icon name="building" /></span></div><div className="stat-value">{amountLabel(statementRecord.net_profit, currency)}</div><div className="stat-bottom"><span>Net result</span><small>Revenue less expenses</small></div></article>
        <article className="stat-card management-stat"><div className="stat-top"><span className="stat-icon blue"><Icon name="users" /></span></div><div className="stat-value">{accounts.length}</div><div className="stat-bottom"><span>Accounts with activity</span><small>Trial balance</small></div></article>
      </div>
      <section className="panel management-panel finance-panel">
        <div className="panel-heading"><div><h2>{reports ? "Management report" : "Account balances"}</h2><p>Source: live ledger reports · amounts are shown in {currency}</p></div><div className="report-actions"><button className="button button-secondary button-small" onClick={exportReport}><Icon name="arrow" size={16} /> Export CSV</button>{onClosePeriod && <button className="button button-danger button-small" disabled={period?.status === "closed"} onClick={onClosePeriod}>{period?.status === "closed" ? "Period closed" : "Close period"}</button>}</div></div>
        <div className="finance-bars">
          <div className="finance-bar-row"><span>Revenue</span><div className="finance-bar-track"><i style={{ width: `${Math.max(revenue, expenses) ? Math.max(3, revenue / Math.max(revenue, expenses) * 100) : 3}%` }} title={amountLabel(revenue, currency)} /></div><strong>{amountLabel(revenue, currency)}</strong></div>
          <div className="finance-bar-row expenses"><span>Expenses</span><div className="finance-bar-track"><i style={{ width: `${Math.max(revenue, expenses) ? Math.max(3, expenses / Math.max(revenue, expenses) * 100) : 3}%` }} title={amountLabel(expenses, currency)} /></div><strong>{amountLabel(expenses, currency)}</strong></div>
        </div>
        <div className="balance-grid">{Object.entries(recordOf(balanceSheet)).map(([label, value]) => <div className="balance-item" key={label}><small>{label}</small><strong>{amountLabel(value, currency)}</strong></div>)}</div>
        <div className="account-list">{accounts.map(([account, value]) => <div className="account-row" key={account}><span>{account}</span><strong>{amountLabel(value, currency)}</strong></div>)}</div>
        <p className="live-data-note">Finance figures use the selected date range and current in-memory fiscal ledger. Account balances reflect the selected entries.</p>
      </section>
    </>
  );
}

function ManagementApprovals({
  data,
  pending,
  currentUserEmail,
  onApprove,
}: {
  data: ManagementRecord;
  pending: string;
  currentUserEmail: string;
  onApprove: (poNumber: string) => void;
}) {
  const orders = rowsOf(data, "purchase_orders");
  return (
    <section className="panel management-panel approvals-panel">
      <div className="panel-heading"><div><h2>Approval inbox</h2><p>Purchase orders are awaiting an independent approver.</p></div><span className="count-pill">{orders.length}</span></div>
      <div className="approval-list">{orders.length ? orders.map((order) => {
        const number = String(order.po_number);
        const isRequester = String(order.requester) === currentUserEmail;
        return <article className="approval-card" key={number}>
          <span className="approval-mark"><Icon name="bell" size={19} /></span>
          <div className="approval-info"><span className="approval-type">PURCHASE ORDER</span><strong>{String(order.supplier_name)} <i>·</i> {amountLabel(order.total_minor)}</strong><small>{number} · Requested by {String(order.requester)}</small></div>
          <button className="button button-primary button-small" disabled={pending === number || isRequester} title={isRequester ? "You cannot approve your own purchase order" : undefined} onClick={() => onApprove(number)}><Icon name="check" size={16} />{pending === number ? "Approving…" : isRequester ? "Your request" : "Approve"}</button>
        </article>;
      }) : <EmptyMessage text="Your approval inbox is clear." />}</div>
    </section>
  );
}

function ManagementResources({
  inventory,
  assets,
  procurement,
  userRole,
  onSubmit,
}: {
  inventory: ManagementRecord;
  assets: ManagementRecord;
  procurement: ManagementRecord;
  userRole: StaffRole;
  onSubmit: (action: ManagementAction, payload: ManagementRecord) => void;
}) {
  const actions = actionsForRole(userRole);
  const stockItems = rowsOf(inventory, "items");
  const fixedAssets = rowsOf(assets, "assets");
  const purchaseOrders = rowsOf(procurement, "purchase_orders");
  return (
    <>
      <div className="resource-summary">
        <div><span className="stat-icon teal"><Icon name="building" /></span><div><small>Inventory valuation</small><strong>{amountLabel(inventory.valuation_minor)}</strong></div></div>
        <div><span className="stat-icon navy"><Icon name="building" /></span><div><small>Stock items</small><strong>{stockItems.length}</strong></div></div>
        <div><span className="stat-icon amber"><Icon name="calendar" /></span><div><small>Registered assets</small><strong>{fixedAssets.length}</strong></div></div>
        <div><span className="stat-icon blue"><Icon name="bell" /></span><div><small>Purchase orders</small><strong>{purchaseOrders.length}</strong></div></div>
      </div>
      <div className="resource-grid">
        {actions.map((action) => <ManagementActionForm action={action} key={action.title} onSubmit={onSubmit} />)}
      </div>
      <section className="panel management-panel resource-registers">
        <div className="panel-heading"><div><h2>Registers</h2><p>Current inventory and fixed asset records</p></div></div>
        <div className="register-columns">
          {(userRole === "admin" || userRole === "manager" || userRole === "accountant" || userRole === "storekeeper") && <div><h3>Inventory</h3>{stockItems.map((item) => <div className="account-row" key={String(item.sku)}><span>{String(item.name)} · {String(item.sku)} · {String(item.on_hand)} on hand</span><strong>{amountLabel(Number(item.unit_cost_minor) * Number(item.on_hand))}</strong></div>)}{!stockItems.length && <small className="empty-hint">No stock items added.</small>}</div>}
          {(userRole === "admin" || userRole === "manager" || userRole === "accountant") && <div><h3>Fixed assets</h3>{fixedAssets.map((asset) => <div className="account-row" key={String(asset.asset_code)}><span>{String(asset.name)} · {String(asset.asset_code)}</span><strong>{amountLabel(asset.cost_minor)}</strong></div>)}{!fixedAssets.length && <small className="empty-hint">No fixed assets added.</small>}</div>}
        </div>
      </section>
    </>
  );
}

function ManagementActionForm({ action, onSubmit }: { action: ManagementAction; onSubmit: (action: ManagementAction, payload: ManagementRecord) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const payload: ManagementRecord = {};
    action.fields.forEach((field) => {
      const value = String(values.get(field.name) ?? "").trim();
      if (value || !field.optional) {
        const numeric = field.type === "number" ? Number(value) : value;
        payload[field.name] = field.name.endsWith("_minor") && typeof numeric === "number"
          ? Math.round(numeric * 100)
          : numeric;
      }
    });
    onSubmit(action, payload);
    event.currentTarget.reset();
  }
  return (
    <section className="panel action-panel">
      <div className="action-panel-heading"><h3>{action.title}</h3><p>{action.description}</p></div>
      <form onSubmit={submit} className="action-form">
        {action.fields.map((field) => <label className="action-field" key={field.name}><span>{field.label}</span><input className="form-input" name={field.name} type={field.type ?? "text"} min={field.min} step={field.type === "number" && field.name.endsWith("_minor") ? "1" : undefined} placeholder={field.placeholder} defaultValue={field.defaultValue} required={!field.optional} /></label>)}
        <button className="button button-primary button-small" type="submit"><Icon name="check" size={16} />Submit</button>
      </form>
    </section>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <div className="empty-state compact-empty"><span className="empty-icon"><Icon name="sparkle" size={20} /></span><strong>Nothing to show</strong><p>{text}</p></div>;
}

function Overview({
  visitors,
  activeVisitors,
  reservations,
  todaysReservations,
  loading,
  onCheckIn,
  onCheckout,
  onViewVisitors,
  onViewAppointments,
}: {
  visitors: Visitor[];
  activeVisitors: Visitor[];
  reservations: Reservation[];
  todaysReservations: Reservation[];
  loading: boolean;
  onCheckIn: () => void;
  onCheckout: (visitor: Visitor) => void;
  onViewVisitors: () => void;
  onViewAppointments: () => void;
}) {
  const checkedOut = visitors.filter((visitor) => visitor.status === "Checked out").length;
  const today = new Intl.DateTimeFormat(UGANDA_LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: UGANDA_TIME_ZONE,
  }).format(new Date());
  const stats = [
    { label: "Today’s arrivals", value: String(todaysReservations.length), delta: "Scheduled check-ins", icon: "users" as const, tone: "teal" },
    { label: "Reservations", value: String(reservations.length), delta: "All recorded stays", icon: "calendar" as const, tone: "blue" },
    { label: "In-house guests", value: String(activeVisitors.length), delta: "Currently checked in", icon: "building" as const, tone: "navy" },
    { label: "Checked out", value: String(checkedOut), delta: "Recorded stays", icon: "clock" as const, tone: "amber" },
  ];
  return (
    <>
      <div className="stats-grid">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div className="stat-top"><span className={`stat-icon ${stat.tone}`}><Icon name={stat.icon} size={20} /></span><button className="quiet-icon" aria-label={`More ${stat.label} details`}><Icon name="more" size={19} /></button></div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-bottom"><span>{stat.label}</span><small>{stat.delta}</small></div>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel visitor-panel">
          <div className="panel-heading">
            <div><div className="panel-title-row"><h2>At the hotel</h2><span className="count-pill">{activeVisitors.length}</span></div><p>Currently checked-in guests</p></div>
            <button className="text-button" onClick={onViewVisitors}>View all <Icon name="arrow" size={15} /></button>
          </div>
          <div className="visitor-list">
            {loading
              ? <EmptyMessage text="Loading guest stays…" />
              : activeVisitors.length
                ? activeVisitors.slice(0, 4).map((visitor) => <VisitorRow key={`${visitor.name}-${visitor.room}`} visitor={visitor} onCheckout={onCheckout} />)
                : <EmptyMessage text="Checked-in guests will appear here." />}
          </div>
          <button className="panel-bottom-action" onClick={onCheckIn}><Icon name="plus" size={17} /> Check in a guest</button>
        </section>
        <section className="panel appointment-panel">
          <div className="panel-heading">
            <div><div className="panel-title-row"><h2>Today’s arrivals</h2><span className="count-pill">{todaysReservations.length}</span></div><p>{today}</p></div>
            <button className="text-button" onClick={onViewAppointments}>Calendar <Icon name="arrow" size={15} /></button>
          </div>
          <div className="schedule-list">
            {todaysReservations.slice(0, 4).map((reservation) => (
              <div className="schedule-row" key={`${reservation.guest_name}-${reservation.room_code}`}>
                <span className="schedule-time">Arrival</span>
                <span className="schedule-marker arrival" />
                <div className="schedule-details"><strong>{reservation.guest_name}</strong><span>Room {reservation.room_code} · {reservation.status}</span></div>
                <Icon name="chevron" size={16} />
              </div>
            ))}
            {!loading && todaysReservations.length === 0 && <EmptyMessage text="No reservations are scheduled to arrive today." />}
          </div>
          <div className="schedule-note"><Icon name="sparkle" size={16} /><span>Showing recorded reservations for today.</span></div>
        </section>
      </div>
      <section className="welcome-strip">
        <div className="welcome-icon"><Icon name="sparkle" size={21} /></div>
        <div><strong>Front desk overview</strong><p>Guest activity and reservations are loaded from the hotel API.</p></div>
        <button className="text-button" onClick={onViewAppointments}>See arrivals <Icon name="arrow" size={15} /></button>
      </section>
    </>
  );
}

function VisitorRow({ visitor, onCheckout }: { visitor: Visitor; onCheckout?: (visitor: Visitor) => void }) {
  return (
    <article className="visitor-row">
      <div className={`avatar guest-avatar avatar-${visitor.initials.charCodeAt(0) % 4}`}>{visitor.initials}</div>
      <div className="guest-details">
        <strong>{visitor.name}</strong>
        <span>{visitor.company} <i>·</i> Room {visitor.room}</span>
        {visitor.status === "Inside" && visitor.balanceMinor > 0 && <span>Folio balance · {amountLabel(visitor.balanceMinor)}</span>}
      </div>
      <div className="guest-arrival"><Icon name="clock" size={14} /><span>{visitor.time}</span></div>
      <span className={`status-badge ${visitor.status.toLowerCase().replace(" ", "-")}`}><span />{visitor.status}</span>
      {visitor.status === "Inside" && onCheckout && <button className="checkout-button" onClick={() => onCheckout(visitor)}>Check out</button>}
    </article>
  );
}

function VisitorPage({ visitors, loading, onCheckout }: { visitors: Visitor[]; loading: boolean; onCheckout: (visitor: Visitor) => void }) {
  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div><div className="panel-title-row"><h2>Guest activity</h2><span className="count-pill">{visitors.length}</span></div><p>Search by guest, company, or room number.</p></div>
        <button className="button button-small button-secondary"><Icon name="filter" size={17} /> Filter</button>
      </div>
      <div className="visitor-list visitor-list-large">
        {loading
          ? <EmptyMessage text="Loading guest stays…" />
          : visitors.length
            ? visitors.map((visitor) => <VisitorRow key={`${visitor.name}-${visitor.room}`} visitor={visitor} onCheckout={onCheckout} />)
            : <EmptyMessage text="There are no guests currently checked in." />}
      </div>
    </section>
  );
}

function AppointmentsPage({
  reservations,
  rooms,
  loading,
  canManageRooms,
  onReserve,
  onCancel,
  onCreateRoom,
}: {
  reservations: Reservation[];
  rooms: HotelRoom[];
  loading: boolean;
  canManageRooms: boolean;
  onReserve: () => void;
  onCancel: (reservation: Reservation) => void;
  onCreateRoom: (room: { room_code: string; room_type: string; rate_minor: number }) => void;
}) {
  return (
    <>
      <section className="panel full-panel calendar-panel">
        <div className="panel-heading">
          <div><div className="panel-title-row"><h2>Reservations</h2><span className="count-pill">{reservations.length}</span></div><p>Room assignments, stay dates, and booking status.</p></div>
          <button className="button button-small button-secondary" onClick={onReserve}><Icon name="plus" size={17} /> Add reservation</button>
        </div>
        <div className="appointment-list">
          {loading
            ? <EmptyMessage text="Loading reservations…" />
            : reservations.length
              ? reservations.map((reservation) => (
                <article className="appointment-card" key={reservation.reservation_id}>
                  <time>{reservation.check_in}</time>
                  <span className="schedule-marker arrival" />
                  <div className="appointment-info"><strong>{reservation.guest_name}</strong><span>Room {reservation.room_code} · Check-out {reservation.check_out} · {amountLabel(reservation.rate_minor)} / night</span></div>
                  <span className="appointment-tag">{reservation.status.replace("_", " ")}</span>
                  {reservation.status === "confirmed"
                    ? <button className="checkout-button" onClick={() => onCancel(reservation)}>Cancel</button>
                    : <span className="quiet-icon" aria-hidden="true"><Icon name="check" size={18} /></span>}
                </article>
              ))
              : <EmptyMessage text="Create a reservation to see upcoming guest arrivals here." />}
        </div>
      </section>
      <section className="panel full-panel">
        <div className="panel-heading">
          <div><div className="panel-title-row"><h2>Room inventory</h2><span className="count-pill">{rooms.length}</span></div><p>Availability is checked against active stays and reservations.</p></div>
        </div>
        <div className="management-record-list">
          {rooms.length ? rooms.map((room) => (
            <div className="management-record" key={room.room_code}>
              <span className="record-icon"><Icon name="building" size={17} /></span>
              <div><strong>Room {room.room_code}</strong><small>{room.room_type} · {amountLabel(room.rate_minor)} per night</small></div>
              <span className={`status-badge ${room.status === "occupied" ? "waiting" : "inside"}`}><span />{room.status}</span>
            </div>
          )) : <EmptyMessage text="No rooms registered yet. A manager can add rooms below." />}
        </div>
      </section>
      {canManageRooms && <RoomRegistrationForm onCreateRoom={onCreateRoom} />}
    </>
  );
}

function RoomRegistrationForm({ onCreateRoom }: { onCreateRoom: (room: { room_code: string; room_type: string; rate_minor: number }) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onCreateRoom({
      room_code: String(form.get("room_code")).trim(),
      room_type: String(form.get("room_type")).trim(),
      rate_minor: Number(form.get("rate_minor")),
    });
    event.currentTarget.reset();
  }

  return (
    <section className="panel management-panel">
      <div className="panel-heading"><div><h2>Register a room</h2><p>Add rooms to availability. Room registration is restricted to managers and admins.</p></div></div>
      <form className="action-form room-registration-form" onSubmit={submit}>
        <label className="action-field"><span>Room number</span><input className="form-input" name="room_code" required /></label>
        <label className="action-field"><span>Room type</span><input className="form-input" name="room_type" placeholder="Standard, deluxe…" required /></label>
        <label className="action-field"><span>Nightly rate (UGX)</span><input className="form-input" name="rate_minor" type="number" min="1" step="1" required /></label>
        <button className="button button-primary" type="submit"><Icon name="plus" size={17} />Add room</button>
      </form>
    </section>
  );
}

function HistoryPage({ visitors }: { visitors: Visitor[] }) {
  const checkedOut = visitors.filter((visitor) => visitor.status === "Checked out");
  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div><div className="panel-title-row"><h2>Recent activity</h2><span className="count-pill">{checkedOut.length}</span></div><p>Guest stays recorded by the hotel API.</p></div>
      </div>
      {checkedOut.length ? (
        <div className="visitor-list visitor-list-large">
          {checkedOut.map((visitor) => <VisitorRow key={`${visitor.name}-${visitor.room}`} visitor={visitor} />)}
        </div>
      ) : (
        <div className="empty-state"><span className="empty-icon"><Icon name="clock" size={23} /></span><strong>No activity yet</strong><p>Your recent check-ins and check-outs will appear here.</p></div>
      )}
    </section>
  );
}

export default App;
