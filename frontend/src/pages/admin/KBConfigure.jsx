import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { BookOpenIcon, CheckIcon, PencilSquareIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function KBConfigure() {
    const [categories, setCategories] = useState([]);
    const [products, setProducts] = useState([]);
    const [versionLimit, setVersionLimit] = useState(20);
    const [categoryName, setCategoryName] = useState('');
    const [productName, setProductName] = useState('');

    async function load() {
        const res = await api.get('/knowledge-base/config');
        setCategories(res.data.categories || []);
        setProducts(res.data.products || []);
        setVersionLimit(res.data.version_limit ?? 20);
    }

    useEffect(() => { load(); }, []);

    async function saveLimit() {
        const n = Number(versionLimit);
        if (!Number.isInteger(n) || n < 0) return toast.error('Version limit must be a non-negative whole number');
        try {
            const res = await api.put('/knowledge-base/config/version-limit', { value: n });
            setVersionLimit(res.data.version_limit);
            toast.success('KB version limit saved');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        }
    }

    async function addItem(type) {
        const name = type === 'categories' ? categoryName : productName;
        if (!name.trim()) return toast.error('Please enter a name');
        try {
            await api.post(`/knowledge-base/config/${type}`, { name });
            if (type === 'categories') setCategoryName(''); else setProductName('');
            toast.success('Saved');
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        }
    }

    async function updateItem(type, item, name) {
        if (!name.trim()) return toast.error('Please enter a name');
        try {
            await api.put(`/knowledge-base/config/${type}/${item.id}`, { name });
            toast.success('Updated');
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Update failed');
            throw err;
        }
    }

    async function remove(type, item) {
        if (!confirm(`Delete "${item.name}"?`)) return;
        try {
            await api.delete(`/knowledge-base/config/${type}/${item.id}`);
            toast.success('Deleted');
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Delete failed');
        }
    }

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <BookOpenIcon className="w-7 h-7 text-blue-600" /> KB Configure
                </h1>
            </div>

            <div className="card p-4 max-w-md space-y-3">
                <div>
                    <label className="label">Versions to Keep</label>
                    <input className="input" type="number" min="0" max="500"
                           value={versionLimit}
                           onChange={e => setVersionLimit(e.target.value)} />
                    <p className="text-xs text-slate-400 mt-1">Default 20. Set 0 to disable history retention.</p>
                </div>
                <button className="btn-primary" onClick={saveLimit}>Save Version Limit</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ConfigList title="Categories" type="categories" items={categories}
                            value={categoryName} onChange={setCategoryName}
                            onAdd={() => addItem('categories')}
                            onUpdate={(item, name) => updateItem('categories', item, name)}
                            onDelete={item => remove('categories', item)} />
                <ConfigList title="Products" type="products" items={products}
                            value={productName} onChange={setProductName}
                            onAdd={() => addItem('products')}
                            onUpdate={(item, name) => updateItem('products', item, name)}
                            onDelete={item => remove('products', item)} />
            </div>
        </div>
    );
}

function ConfigList({ title, items, value, onChange, onAdd, onUpdate, onDelete }) {
    const [editing, setEditing] = useState(null);
    const [editName, setEditName] = useState('');

    function beginEdit(item) {
        setEditing(item.id);
        setEditName(item.name || '');
    }

    async function saveEdit(item) {
        try {
            await onUpdate(item, editName);
            setEditing(null);
            setEditName('');
        } catch {
            // Keep the row in edit mode so the user can fix duplicate or invalid names.
        }
    }

    function cancelEdit() {
        setEditing(null);
        setEditName('');
    }

    return (
        <div className="card p-4 space-y-4">
            <h2 className="text-lg font-bold">{title}</h2>
            <div className="flex gap-2">
                <input className="input" placeholder={`New ${title.slice(0, -1)}`}
                       value={value} onChange={e => onChange(e.target.value)} />
                <button className="btn-primary" onClick={onAdd}>
                    <PlusIcon className="w-4 h-4" /> Add
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="table-clean">
                    <thead><tr><th>Name</th><th>System</th><th></th></tr></thead>
                    <tbody>
                        {items.map(item => {
                            const isEditing = editing === item.id;
                            return (
                                <tr key={item.id}>
                                    <td className="font-semibold">
                                        {isEditing ? (
                                            <input className="input !py-1.5"
                                                   value={editName}
                                                   onChange={e => setEditName(e.target.value)}
                                                   onKeyDown={e => {
                                                       if (e.key === 'Enter') saveEdit(item);
                                                       if (e.key === 'Escape') cancelEdit();
                                                   }} />
                                        ) : item.name}
                                    </td>
                                    <td>{item.is_system ? <span className="pill bg-blue-100 text-blue-700">Default</span> : ''}</td>
                                    <td className="text-right">
                                        <div className="inline-flex items-center gap-1">
                                            {isEditing ? (
                                                <>
                                                    <button className="btn-ghost" title="Save" onClick={() => saveEdit(item)}>
                                                        <CheckIcon className="w-4 h-4 text-emerald-600" />
                                                    </button>
                                                    <button className="btn-ghost" title="Cancel" onClick={cancelEdit}>
                                                        <XMarkIcon className="w-4 h-4 text-slate-500" />
                                                    </button>
                                                </>
                                            ) : (
                                                <button className="btn-ghost" title="Edit" onClick={() => beginEdit(item)}>
                                                    <PencilSquareIcon className="w-4 h-4 text-blue-600" />
                                                </button>
                                            )}
                                            <button className="btn-ghost" title="Delete" onClick={() => onDelete(item)}>
                                                <TrashIcon className="w-4 h-4 text-red-500" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {items.length === 0 && <tr><td colSpan={3} className="text-center text-slate-400 py-6">No items.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
