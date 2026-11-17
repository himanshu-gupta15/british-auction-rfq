import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import AuctionList from './pages/AuctionList.jsx';
import CreateRfq from './pages/CreateRfq.jsx';
import AuctionDetails from './pages/AuctionDetails.jsx';
import { LogoIcon } from './components/Icons.jsx';

export default function App() {
  const { pathname } = useLocation();
  const refresh = pathname === '/' ? 'refreshes every 5s' : pathname.startsWith('/rfqs/') && pathname !== '/rfqs/new' ? 'refreshes every 3s' : null;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <Link to="/" className="brand">
              <span className="brand-mark"><LogoIcon /></span>
              <span>Reverse<b>Bid</b></span>
            </Link>
            <nav className="nav" aria-label="Primary">
              <NavLink to="/" end className={({ isActive }) => `nav-link${isActive || (pathname.startsWith('/rfqs/') && pathname !== '/rfqs/new') ? ' active' : ''}`}>
                Auctions
              </NavLink>
              <NavLink to="/rfqs/new" className="nav-link">Create RFQ</NavLink>
            </nav>
          </div>
          {refresh && (
            <span className="live"><span className="live-dot" /><span className="live-text">Live · {refresh}</span></span>
          )}
        </div>
      </header>
      <Routes>
        <Route path="/" element={<AuctionList />} />
        <Route path="/rfqs/new" element={<CreateRfq />} />
        <Route path="/rfqs/:id" element={<AuctionDetails />} />
        <Route path="*" element={<main className="page"><p>Page not found. <Link to="/">Back to auctions</Link></p></main>} />
      </Routes>
    </>
  );
}
