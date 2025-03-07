import React from 'react';

import { cn } from "@/lib/utils"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ type = 'text', onChange, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        onChange={onChange}
        {...props}
        className={`px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${props.className}`}
      />
    );
  }
);

Input.displayName = 'Input';

export default Input;
