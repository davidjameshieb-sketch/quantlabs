import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: 'Email is required' })
  .email({ message: 'Please enter a valid email address' })
  .max(255, { message: 'Email must be less than 255 characters' });

export const passwordSchema = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters' })
  .max(128, { message: 'Password must be less than 128 characters' });

export const authSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type AuthFormData = z.infer<typeof authSchema>;

export const validateAuthForm = (data: { email: string; password: string }) => {
  const result = authSchema.safeParse(data);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    return {
      isValid: false,
      errors: {
        email: errors.email?.[0],
        password: errors.password?.[0],
      },
    };
  }
  return { isValid: true, errors: {} };
};
