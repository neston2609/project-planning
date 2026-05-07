import { statusClass } from '../format';

export default function StatusPill({ status }) {
    return <span className={statusClass(status)}>{status}</span>;
}
