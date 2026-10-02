import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

export default function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <PageHeader
      title="Page not found"
      description="This page doesn't exist or may have been moved."
      actions={<Button to="/">Go to dashboard</Button>}
    />
  );
}
