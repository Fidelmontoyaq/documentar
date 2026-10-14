export const TOUR_KEY = 'docucraft.tour.off';
export const tourDisabled = () => {
  try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return false; }
};
