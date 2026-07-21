import { Owner } from '../constants'
export interface Booking { email: string; name: string; owner?: Owner; callDate: Date }
export interface BookingProvider { fetchNewBookings(): Promise<Booking[]> }
export class MockBookingProvider implements BookingProvider {
  async fetchNewBookings(): Promise<Booking[]> { return [] }
}
export const bookingProvider: BookingProvider = new MockBookingProvider()
