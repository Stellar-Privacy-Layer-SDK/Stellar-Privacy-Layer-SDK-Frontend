import { Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Deposit } from './pages/Deposit';
import { Withdraw } from './pages/Withdraw';
import { Compliance } from './pages/Compliance';
import { ViewingKeys } from './pages/ViewingKeys';
import { TransactionHistory } from './pages/History';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/deposit" element={<Deposit />} />
        <Route path="/withdraw" element={<Withdraw />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/viewing-keys" element={<ViewingKeys />} />
        <Route path="/history" element={<TransactionHistory />} />
      </Route>
    </Routes>
  );
}
