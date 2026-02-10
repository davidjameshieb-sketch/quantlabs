import { createContext, useContext } from 'react';

interface LongOnlyFilterContextType {
  longOnlyFilter: boolean;
}

const LongOnlyFilterContext = createContext<LongOnlyFilterContextType>({ longOnlyFilter: false });

export const LongOnlyFilterProvider = LongOnlyFilterContext.Provider;
export const useLongOnlyFilter = () => useContext(LongOnlyFilterContext);
