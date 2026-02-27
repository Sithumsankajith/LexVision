import React from 'react';
import {
    Users as UsersIcon,
    MoreHorizontal
} from 'lucide-react';
import { Button } from '@lexvision/ui';
import { Panel, DataTable, Badge } from '@lexvision/ui';

const USERS = [
    { id: 'USR-01', name: 'Admin One', role: 'System Admin', status: 'Active', lastLogin: '10 mins ago' },
    { id: 'USR-02', name: 'Officer Silva', role: 'Traffic Police', status: 'Active', lastLogin: '2 hours ago' },
    { id: 'USR-03', name: 'Officer Perera', role: 'Traffic Police', status: 'Active', lastLogin: 'Just now' },
    { id: 'USR-04', name: 'Admin Two', role: 'Analyst', status: 'Inactive', lastLogin: '5 days ago' },
];

export const Users: React.FC = () => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>User Management</h1>
                <Button leftIcon={<UsersIcon size={16} />}>Add New User</Button>
            </div>

            <Panel
                title="System Accounts"
                action={<Button size="sm" variant="outline">Filter</Button>}
                noPadding
            >
                <DataTable headers={['User ID', 'Name', 'Role', 'Status', 'Last Login', 'Action']}>
                    {USERS.map((user) => (
                        <tr key={user.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: '500' }}>{user.id}</td>
                            <td>{user.name}</td>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {user.role}
                                </div>
                            </td>
                            <td>
                                <Badge variant={user.status === 'Active' ? 'success' : 'error'}>
                                    {user.status}
                                </Badge>
                            </td>
                            <td style={{ color: 'var(--color-text-secondary)' }}>{user.lastLogin}</td>
                            <td>
                                <Button variant="ghost" size="sm"><MoreHorizontal size={16} /></Button>
                            </td>
                        </tr>
                    ))}
                </DataTable>
            </Panel>
        </div>
    );
};
