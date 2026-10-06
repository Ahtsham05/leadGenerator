import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/Misc';

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="This page does not exist"
      action={
        <Link to="/" className="font-medium underline">
          Back to the overview
        </Link>
      }
    >
      The address may be mistyped, or the lead was deleted.
    </EmptyState>
  );
}
