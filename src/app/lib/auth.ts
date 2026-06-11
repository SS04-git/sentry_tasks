export const saveToken = (token: string) => {           // stores JWT in localStorage after login
  localStorage.setItem('token', token);
};

export const getToken = () => {
  return localStorage.getItem('token');                 // retrieves it on every page load
};

export const removeToken = () => {                      // clears it on logout
  localStorage.removeItem('token');
};

export const isAuthenticated = () => {
  return !!localStorage.getItem('token');
};