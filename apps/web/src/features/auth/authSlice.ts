import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const KEY = 'lead.token';

function load(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function persist(token: string | null, remember: boolean) {
  try {
    if (token && remember) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* Storage can be blocked; the session still works until the tab closes. */
  }
}

export interface AuthState {
  token: string | null;
}

const slice = createSlice({
  name: 'auth',
  initialState: { token: load() } as AuthState,
  reducers: {
    signedIn(state, action: PayloadAction<{ token: string; remember: boolean }>) {
      state.token = action.payload.token;
      persist(action.payload.token, action.payload.remember);
    },
    signedOut(state) {
      state.token = null;
      persist(null, false);
    },
  },
});

export const { signedIn, signedOut } = slice.actions;
export default slice.reducer;
