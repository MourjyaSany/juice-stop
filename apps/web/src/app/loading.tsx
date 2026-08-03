import { PizzaLoader } from '@/components/pizza-loader';

/**
 * Route-transition loading UI.
 *
 * Next renders this while a route's server work resolves. It replaces a blank screen, which is the
 * only thing worse than a wait: a customer who taps "Menu" and sees nothing assumes the tap missed.
 */
export default function Loading() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <PizzaLoader size={104} label="Loading" />
    </main>
  );
}
