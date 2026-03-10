import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CreateProduct from './pages/CreateProduct';
import ProductList from './pages/ProductList';
import ProductDetail from './pages/ProductDetail';
import JsonGenerator from './pages/JsonGenerator';
import BatchJsonGenerator from './pages/BatchJsonGenerator';
import Settings from './pages/Settings';
import TaskQueue from './components/TaskQueue';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/create" element={<CreateProduct />} />
          <Route path="/products" element={<ProductList />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/json-generator" element={<JsonGenerator />} />
          <Route path="/batch-generator" element={<BatchJsonGenerator />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
      <TaskQueue />
    </BrowserRouter>
  );
}

export default App;
