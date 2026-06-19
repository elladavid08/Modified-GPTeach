const API_BASE_URL =
  process.env.REACT_APP_API_URL !== undefined
    ? process.env.REACT_APP_API_URL
    : 'http://localhost:3001';

async function handleResponse(res) {
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data;
}

export async function getAllUsersApi(adminId) {
  const res = await fetch(
    `${API_BASE_URL}/api/users?adminId=${encodeURIComponent(adminId)}`
  );
  const data = await handleResponse(res);
  return data.users;
}

export async function getResearchParticipantsApi(requesterId) {
  const res = await fetch(
    `${API_BASE_URL}/api/research-participants?requesterId=${encodeURIComponent(requesterId)}`
  );
  const data = await handleResponse(res);
  return data.users;
}

export async function updateUserResearchStatusApi(userId, adminId, updates) {
  const res = await fetch(
    `${API_BASE_URL}/api/users/${encodeURIComponent(userId)}/research-status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId, ...updates }),
    }
  );
  await handleResponse(res);
}

export async function getConversationsByUserApi(userId, requesterId) {
  const res = await fetch(
    `${API_BASE_URL}/api/users/${encodeURIComponent(userId)}/conversations?requesterId=${encodeURIComponent(requesterId)}`
  );
  const data = await handleResponse(res);
  return data.conversations;
}
