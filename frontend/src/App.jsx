import { NavLink, Route, Routes } from 'react-router-dom';
import AuctionList from './pages/AuctionList.jsx';
import CreateRfq from './pages/CreateRfq.jsx';
import AuctionDetails from './pages/AuctionDetails.jsx';

export default function App() {
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <NavLink to="/" className="brand">⚡ British Auction RFQ</NavLink>
          <nav>
            <NavLink to="/" end>Auctions</NavLink>
            <NavLink to="/rfqs/new" className="btn btn-primary btn-sm">+ Create RFQ</NavLink>
          </nav>
        </div>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<AuctionList />} />
          <Route path="/rfqs/new" element={<CreateRfq />} />
          <Route path="/rfqs/:id" element={<AuctionDetails />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}
