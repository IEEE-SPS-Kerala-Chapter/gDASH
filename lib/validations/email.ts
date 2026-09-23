import { z } from "zod";

export const EMAIL_SPACES_MESSAGE = "Email addresses can't contain spaces";
export const EMAIL_INVALID_MESSAGE = "Enter a valid email address";

/**
 * Email field with one clear message per mistake, checked in this order
 * (the form shows the first that fails): empty, contains a space, anything
 * else malformed. Leading/trailing spaces are simply trimmed off. The
 * registration forms set noValidate, so these messages replace the
 * browser's own ("A part followed by '@' should not contain…"), which
 * differs per browser and language.
 */
export function emailField(emptyMessage: string) {
  return z
    .string()
    .trim()
    .toLowerCase()
    .min(1, emptyMessage)
    .regex(/^\S*$/, EMAIL_SPACES_MESSAGE)
    .email(EMAIL_INVALID_MESSAGE);
}
