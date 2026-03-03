import React, { useEffect, useState } from 'react';
import {
    Users as UsersIcon,
    MoreHorizontal,
    Plus,
    X
} from 'lucide-react';
import { Button, Input, Select } from '@lexvision/ui';
import { Panel, DataTable, Badge } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';

export const Users: React.FC = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newUser, setNewUser] = useState({ email: '', password: '', role: 'POLICE' });

    const fetchUsers = async () => {
        try {
            const data = await mockDb.adminGetUsers();
            setUsers(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleCreateUser = async () => {
        try {
            await mockDb.adminCreateUser(newUser);
            setIsAdding(false);
            setNewUser({ email: '', password: '', role: 'POLICE' });
            fetchUsers(); // Refresh list
        } catch (e: any) {
            alert(e.message || 'Failed to create user');
        }
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>User Management</h1>
                <Button leftIcon={isAdding ? <X size={16} /> : <Plus size={16} />} onClick={() => setIsAdding(!isAdding)} variant={isAdding ? 'outline' : 'primary'}>
                    {isAdding ? 'Cancel' : 'Add New User'}
                </Button>
            </div>

            {isAdding && (
                <Panel title="Create New Administrative User">
                    <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <Input label="Email Address" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} fullWidth />
                        </div>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <Input label="Temporary Password" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} fullWidth />
                        </div>
                        <div style={{ width: '200px' }}>
                            <Select label="Role" value={newUser.role} onChange={(val) => setNewUser({ ...newUser, role: val as string })} options={[{ value: 'POLICE', label: 'Police Officer' }, { value: 'ADMIN', label: 'System Admin' }]} />
                        </div>
                        <Button onClick={handleCreateUser}>Create User</Button>
                    </div>
                </Panel>
            )}

            <Panel
                title="System Accounts"
                action={<Button size="sm" variant="outline">Filter</Button>}
                noPadding
            >
                <DataTable headers={['User ID', 'Email', 'Role', 'Status', 'Joined', 'Action']}>
                    {users.map((user) => (
                        <tr key={user.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: '500' }}>...{user.id.substring(user.id.length - 8)}</td>
                            <td>{user.email}</td>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {user.role}
                                </div>
                            </td>
                            <td>
                                <Badge variant="success">Active</Badge>
                            </td>
                            <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(user.created_at).toLocaleDateString()}</td>
                            <td>
                                <Button variant="ghost" size="sm"><MoreHorizontal size={16} /></Button>
                            </td>
                        </tr>
                    ))}
                    {users.length === 0 && !loading && (
                        <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No users found.</td>
                        </tr>
                    )}
                </DataTable>
            </Panel>
        </div>
    );
};
