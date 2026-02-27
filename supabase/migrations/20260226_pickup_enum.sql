-- Fix: order_status is an ENUM, not TEXT. Add picked_up value.
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'picked_up';
