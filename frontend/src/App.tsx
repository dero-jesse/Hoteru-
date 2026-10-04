import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { checkInGuest, checkOutGuest, createReservation } from "./api";

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
  status: "Inside" | "Waiting" | "Checked out";
  live?: boolean;
};

const previewVisitors: Visitor[] = [
  { name: "Sarah Mwangi", initials: "SM", company: "Airtel Kenya", room: "504", time: "10:42 AM", status: "Inside" },
  { name: "James Kamau", initials: "JK", company: "Safaricom", room: "302", time: "10:18 AM", status: "Inside" },
  { name: "Amina Hassan", initials: "AH", company: "KCB Group", room: "218", time: "11:05 AM", status: "Waiting" },
  { name: "David Ochieng", initials: "DO", company: "Equity Bank", room: "117", time: "9:36 AM", status: "Inside" },
];

const appointments = [
  { time: "09:00", name: "James Kamau", detail: "Room 302 · Returning guest", type: "guest" },
  { time: "10:30", name: "Amina Hassan", detail: "Room 218 · Early arrival", type: "arrival" },
  { time: "12:00", name: "Nairobi Design Co.", detail: "Conference room · 4 guests", type: "meeting" },
  { time: "14:15", name: "Peter Wanjiku", detail: "Room 410 · Airport transfer", type: "guest" },
];

type ModalKind = "checkin" | "reservation" | null;
type PageKind = "Overview" | "Visitors" | "Appointments" | "History";

function App() {
  const [page, setPage] = useState<PageKind>("Overview");
  const [query, setQuery] = useState("");
  const [visitors, setVisitors] = useState(previewVisitors);
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

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

  const filteredVisitors = useMemo(
    () => visitors.filter((visitor) =>
      `${visitor.name} ${visitor.company} ${visitor.room}`.toLowerCase().includes(query.toLowerCase()),
    ),
    [visitors, query],
  );
  const today = new Intl.DateTimeFormat("en-KE", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

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
        await checkInGuest(guestName, roomCode);
        setVisitors((current) => [
          {
            name: guestName,
            initials: guestName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
            company: "Hotel guest",
            room: roomCode,
            time: new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date()),
            status: "Inside",
            live: true,
          },
          ...current,
        ]);
        setNotice(`${guestName} checked in successfully.`);
      } else if (modal === "reservation") {
        const rate = Number(form.get("rate"));
        await createReservation({
          guest_name: guestName,
          room_code: roomCode,
          check_in: String(form.get("check_in")),
          check_out: String(form.get("check_out")),
          rate_minor: Math.round(rate * 100),
        });
        setNotice(`Reservation created for ${guestName}.`);
      }
      setModal(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function checkout(visitor: Visitor) {
    setError("");
    setNotice("");
    try {
      await checkOutGuest(visitor.name, visitor.room);
      setVisitors((current) => current.map((item) =>
        item === visitor ? { ...item, status: "Checked out" } : item,
      ));
      setNotice(`${visitor.name} checked out.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Checkout could not be completed.");
    }
  }

  function changePage(nextPage: PageKind) {
    setPage(nextPage);
    setError("");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="#" aria-label="Hoteru home" onClick={() => changePage("Overview")}>
          <span className="brand-mark"><Icon name="sparkle" size={22} /></span>
          <span className="brand-name">hoteru<span>.</span></span>
        </a>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="nav-list">
          {([
            ["Overview", "home"],
            ["Visitors", "users"],
            ["Appointments", "calendar"],
            ["History", "clock"],
          ] as const).map(([label, icon]) => (
            <button
              aria-label={label}
              aria-current={page === label ? "page" : undefined}
              className={`nav-item ${page === label ? "active" : ""}`}
              key={label}
              onClick={() => changePage(label)}
              title={label}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" aria-label="Settings" title="Settings">
            <Icon name="settings" /><span>Settings</span>
          </button>
          <div className="staff-card">
            <div className="avatar avatar-staff">AW</div>
            <div className="staff-details"><strong>Alex Wanjiku</strong><span>Front desk</span></div>
            <Icon name="more" size={18} />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Reception</span><Icon name="chevron" size={15} /><strong>{page}</strong></div>
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
            <button className="icon-button" aria-label="Appearance"><Icon name="sun" size={19} /></button>
            <button className="icon-button notification-button" aria-label="Notifications">
              <Icon name="bell" size={19} /><span className="notification-dot" />
            </button>
            <div className="avatar avatar-top">AW</div>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="live-dot" /> FRONT DESK <span className="eyebrow-divider">/</span> {today.toUpperCase()}</div>
              <h1>{page === "Overview" ? "Good morning, Alex" : page}</h1>
              <p className="heading-subtitle">
                {page === "Overview" ? "Here’s what’s happening at The Meridian today." :
                  page === "Visitors" ? "A clear view of today’s arrivals and in-house guests." :
                    page === "Appointments" ? "Today’s arrivals, meetings, and scheduled visits." :
                      "Recent front desk activity at a glance."}
              </p>
            </div>
            <div className="heading-actions">
              <button className="button button-secondary" onClick={() => setModal("reservation")}>
                <Icon name="calendar" size={18} /> <span>New reservation</span>
              </button>
              <button className="button button-primary" onClick={() => setModal("checkin")}>
                <Icon name="plus" size={19} /> <span>Check in</span>
              </button>
            </div>
          </section>

          {notice && <div className="toast toast-success" role="status"><Icon name="check" size={17} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><Icon name="close" size={16} /></button></div>}
          {error && <div className="toast toast-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><Icon name="close" size={16} /></button></div>}

          {page === "Overview" && <Overview
            visitors={filteredVisitors}
            onCheckIn={() => setModal("checkin")}
            onCheckout={checkout}
            onViewVisitors={() => changePage("Visitors")}
            onViewAppointments={() => changePage("Appointments")}
          />}
          {page === "Visitors" && <VisitorPage visitors={filteredVisitors} onCheckout={checkout} />}
          {page === "Appointments" && <AppointmentsPage onReserve={() => setModal("reservation")} />}
          {page === "History" && <HistoryPage visitors={visitors} />}
        </div>
        <footer className="footer"><span><span className="live-dot" /> All systems operational</span><span>Hoteru Front Desk <i>·</i> Preview data</span></footer>
      </main>

      {modal && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <section className="modal" aria-modal="true" role="dialog" aria-labelledby="modal-title">
            <div className="modal-header">
              <div className="modal-icon"><Icon name={modal === "checkin" ? "key" : "calendar"} /></div>
              <button className="icon-button" onClick={() => setModal(null)} aria-label="Close"><Icon name="close" size={19} /></button>
            </div>
            <h2 id="modal-title">{modal === "checkin" ? "Check in a guest" : "New reservation"}</h2>
            <p className="modal-subtitle">A couple of details and you’re all set.</p>
            <form onSubmit={submitReceptionForm}>
              <label className="field-label" htmlFor="guest_name">Guest name</label>
              <input autoFocus className="form-input" id="guest_name" name="guest_name" placeholder="e.g. Jane Mwangi" required />
              <label className="field-label" htmlFor="room_code">Room number</label>
              <input className="form-input" id="room_code" name="room_code" placeholder="e.g. 204" required />
              {modal === "reservation" && (
                <>
                  <div className="form-row">
                    <div><label className="field-label" htmlFor="check_in">Check in</label><input className="form-input" id="check_in" name="check_in" type="date" required /></div>
                    <div><label className="field-label" htmlFor="check_out">Check out</label><input className="form-input" id="check_out" name="check_out" type="date" required /></div>
                  </div>
                  <label className="field-label" htmlFor="rate">Nightly rate <span className="field-hint">KES</span></label>
                  <input className="form-input" id="rate" name="rate" type="number" min="1" step="1" placeholder="15,000" required />
                </>
              )}
              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="button button-primary" disabled={busy}>
                  <Icon name={modal === "checkin" ? "key" : "check"} size={18} />
                  {busy ? "Saving..." : modal === "checkin" ? "Confirm check-in" : "Create reservation"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function Overview({
  visitors,
  onCheckIn,
  onCheckout,
  onViewVisitors,
  onViewAppointments,
}: {
  visitors: Visitor[];
  onCheckIn: () => void;
  onCheckout: (visitor: Visitor) => void;
  onViewVisitors: () => void;
  onViewAppointments: () => void;
}) {
  const inside = visitors.filter((visitor) => visitor.status === "Inside").length;
  const waiting = visitors.filter((visitor) => visitor.status === "Waiting").length;
  const checkedInDuringSession = visitors.filter((visitor) => visitor.live && visitor.status === "Inside").length;
  const today = new Intl.DateTimeFormat("en-KE", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  const stats = [
    { label: "Today’s arrivals", value: "18", delta: "6 expected soon", icon: "users" as const, tone: "teal" },
    { label: "Appointments", value: "12", delta: "Next at 10:30 AM", icon: "calendar" as const, tone: "blue" },
    { label: "In-house guests", value: String(32 + checkedInDuringSession), delta: `${inside} checked in today`, icon: "building" as const, tone: "navy" },
    { label: "Needs attention", value: String(4 + waiting), delta: "2 requests · 2 early", icon: "clock" as const, tone: "amber" },
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
            <div><div className="panel-title-row"><h2>At the hotel</h2><span className="count-pill">{visitors.length}</span></div><p>Guest arrivals and in-house</p></div>
            <button className="text-button" onClick={onViewVisitors}>View all <Icon name="arrow" size={15} /></button>
          </div>
          <div className="visitor-list">
            {visitors.slice(0, 4).map((visitor) => <VisitorRow key={`${visitor.name}-${visitor.room}`} visitor={visitor} onCheckout={onCheckout} />)}
          </div>
          <button className="panel-bottom-action" onClick={onCheckIn}><Icon name="plus" size={17} /> Check in a guest</button>
        </section>
        <section className="panel appointment-panel">
          <div className="panel-heading">
            <div><div className="panel-title-row"><h2>Today’s schedule</h2><span className="count-pill">4</span></div><p>{today}</p></div>
            <button className="text-button" onClick={onViewAppointments}>Calendar <Icon name="arrow" size={15} /></button>
          </div>
          <div className="schedule-list">
            {appointments.slice(0, 4).map((appointment) => (
              <div className="schedule-row" key={`${appointment.time}-${appointment.name}`}>
                <span className="schedule-time">{appointment.time}</span>
                <span className={`schedule-marker ${appointment.type}`} />
                <div className="schedule-details"><strong>{appointment.name}</strong><span>{appointment.detail}</span></div>
                <Icon name="chevron" size={16} />
              </div>
            ))}
          </div>
          <div className="schedule-note"><Icon name="sparkle" size={16} /><span>Next arrival in <strong>15 minutes</strong></span></div>
        </section>
      </div>
      <section className="welcome-strip">
        <div className="welcome-icon"><Icon name="sparkle" size={21} /></div>
        <div><strong>A little heads-up</strong><p>3 guests requested early check-in today. Rooms 218, 306, and 410.</p></div>
        <button className="text-button" onClick={onViewAppointments}>See arrivals <Icon name="arrow" size={15} /></button>
      </section>
    </>
  );
}

function VisitorRow({ visitor, onCheckout }: { visitor: Visitor; onCheckout?: (visitor: Visitor) => void }) {
  return (
    <article className="visitor-row">
      <div className={`avatar guest-avatar avatar-${visitor.initials.charCodeAt(0) % 4}`}>{visitor.initials}</div>
      <div className="guest-details"><strong>{visitor.name}</strong><span>{visitor.company} <i>·</i> Room {visitor.room}</span></div>
      <div className="guest-arrival"><Icon name="clock" size={14} /><span>{visitor.time}</span></div>
      <span className={`status-badge ${visitor.status.toLowerCase().replace(" ", "-")}`}><span />{visitor.status}</span>
      {visitor.live && visitor.status === "Inside" && onCheckout && <button className="checkout-button" onClick={() => onCheckout(visitor)}>Check out</button>}
    </article>
  );
}

function VisitorPage({ visitors, onCheckout }: { visitors: Visitor[]; onCheckout: (visitor: Visitor) => void }) {
  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div><div className="panel-title-row"><h2>Guest activity</h2><span className="count-pill">{visitors.length}</span></div><p>Search by guest, company, or room number.</p></div>
        <button className="button button-small button-secondary"><Icon name="filter" size={17} /> Filter</button>
      </div>
      <div className="visitor-list visitor-list-large">
        {visitors.map((visitor) => <VisitorRow key={`${visitor.name}-${visitor.room}`} visitor={visitor} onCheckout={onCheckout} />)}
      </div>
      <p className="preview-note">Sample visitor records are preview data. Only check-ins made in this session can be checked out.</p>
    </section>
  );
}

function AppointmentsPage({ onReserve }: { onReserve: () => void }) {
  const today = new Intl.DateTimeFormat("en-KE", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  return (
    <section className="panel full-panel calendar-panel">
      <div className="panel-heading">
        <div><div className="panel-title-row"><h2>{today}</h2><span className="today-pill">Today</span></div><p>4 scheduled arrivals and visits</p></div>
        <button className="button button-small button-secondary" onClick={onReserve}><Icon name="plus" size={17} /> Add reservation</button>
      </div>
      <div className="appointment-list">
        {appointments.map((appointment) => (
          <article className="appointment-card" key={`${appointment.time}-${appointment.name}`}>
            <time>{appointment.time}</time>
            <span className={`schedule-marker ${appointment.type}`} />
            <div className="appointment-info"><strong>{appointment.name}</strong><span>{appointment.detail}</span></div>
            <span className="appointment-tag">{appointment.type === "arrival" ? "Early arrival" : appointment.type === "meeting" ? "Meeting" : "Guest arrival"}</span>
            <button className="quiet-icon" aria-label={`More about ${appointment.name}`}><Icon name="more" size={19} /></button>
          </article>
        ))}
      </div>
      <p className="preview-note">Appointment schedule shown is preview data.</p>
    </section>
  );
}

function HistoryPage({ visitors }: { visitors: Visitor[] }) {
  const checkedOut = visitors.filter((visitor) => visitor.status === "Checked out");
  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div><div className="panel-title-row"><h2>Recent activity</h2><span className="count-pill">{checkedOut.length}</span></div><p>Check-ins and check-outs recorded during this session.</p></div>
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
