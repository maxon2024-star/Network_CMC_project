import axios from 'axios';

const cncClient = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Отправка управляющей программы на сервер прикладного уровня
 * для валидации и передачи на агентный уровень.
 */
export async function sendCncCommands(sender, rawInput) {
  const response = await cncClient.post('/commands', {
    sender,
    rawInput,
  });
  return response.data;
}
