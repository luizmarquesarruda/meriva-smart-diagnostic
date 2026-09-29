import { parsePidResponse } from '../src/obd/parser';

describe('PID decoder', () => {
  it('decodes one-byte and two-byte PIDs after the response header', () => {
    expect(parsePidResponse('0105', '41 05 69').value).toBe(65);
    expect(parsePidResponse('0106', '41 06 FF').value).toBeCloseTo(-0.78125);
    expect(parsePidResponse('010B', '41 0B 40').value).toBe(64);
    expect(parsePidResponse('010C', '41 0C 1A F8').value).toBe(1726);
    expect(parsePidResponse('0110', '41 10 08 93').value).toBeCloseTo(21.95);
    expect(parsePidResponse('0142', '41 42 36 4F').value).toBeCloseTo(13.903);
  });

  it('does not invent values for unknown or missing responses', () => {
    expect(parsePidResponse('0199', '41 99 FF').value).toBeNull();
    expect(parsePidResponse('010C', 'NO DATA').status).toBe('NÃO RESPONDEU');
  });
});
