// Fake google-auth-library: no credentials, no network.
export class GoogleAuth {
  async getClient() {
    return { email: 'fake@test', getAccessToken: async () => ({ token: 'fake-token' }) };
  }

  async getProjectId() {
    return 'fake-project';
  }
}
