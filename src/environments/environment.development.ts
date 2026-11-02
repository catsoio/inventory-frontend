export const environment = {
  // Följer adressen sidan öppnades från, så samma bygge funkar på localhost och från mobilen på nätverket.
  apiUrl: `http://${window.location.hostname}:3000/api`,
  workOrders: true,
};
