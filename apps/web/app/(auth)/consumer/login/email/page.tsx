import { redirect } from 'next/navigation';

// Email and phone login are now a single screen at /consumer/login. This route
// is kept as a permanent redirect so old links/bookmarks keep working.
export default function ConsumerLoginEmailRedirect() {
  redirect('/consumer/login');
}
