'use strict';
const config = require('../../config');

/**
 * MSG91 WhatsApp Business API client — genuinely new infrastructure, there
 * was no `services/`/`integrations/` folder anywhere in this codebase to
 * match, and no prior WhatsApp/SMS call to copy from. `src/integrations/`
 * was created as a new, clearly-scoped home for outbound third-party API
 * clients, distinct from `src/core/` (generic technical infra with zero
 * external dependencies) and `src/modules/*` (tenant-scoped business logic).
 *
 * ── IMPORTANT — read before trusting this shape in production ──────────────
 * MSG91's full API reference is gated behind a logged-in control.msg91.com
 * session; it is NOT fully available in their public docs. This request
 * shape is built from the best-corroborated public source found (MSG91's
 * own published Ruby SDK reference: github.com/Walkover-Web-Solution/
 * msg91-whatsapp-sdk-ruby — `integrated_number` / `content_type: 'template'`
 * / `payload.template.{name,language,to_and_components}`, response
 * `{status, hasError, data, request_id}`), plus the standard WhatsApp
 * Business (Meta Cloud API) template BODY-parameter contract every BSP
 * (MSG91 included) proxies to for variable substitution
 * (`components:[{type:'body',parameters:[{type:'text',text:...}]}]`).
 * I could NOT independently verify MSG91's exact field-by-field contract
 * against their live API reference. Whoever owns the MSG91 account should
 * confirm this against a real sandbox call before the first production send.
 * Nothing in this repo can accidentally do that today: sending requires all
 * FOUR of WHATSAPP_API_URL / WHATSAPP_API_TOKEN / WHATSAPP_SENDER_NUMBER /
 * WHATSAPP_TEMPLATE_NAME to be set, and none of them are by default.
 */
class WhatsAppClient {
  _cfg() { return config.notifications; }

  /** Whether every piece of config a real send needs is actually present. */
  isConfigured() {
    const c = this._cfg();
    return !!(c.whatsappUrl && c.whatsappToken && c.whatsappSenderNumber && c.whatsappTemplateName);
  }

  /**
   * @param {{to: string, templateName: string, variables: string[], languageCode?: string}} params
   * @returns {Promise<{success: boolean, providerMessageId: string|null, errorMessage: string|null}>}
   *   Normalized result — a provider error or network failure NEVER throws,
   *   so one bad send can never abort a bulk batch.
   */
  async sendTemplateMessage({ to, templateName, variables = [], languageCode = 'en' }) {
    if (!this.isConfigured()) {
      return {
        success: false,
        providerMessageId: null,
        errorMessage: 'WhatsApp is not configured (WHATSAPP_API_URL/WHATSAPP_API_TOKEN/WHATSAPP_SENDER_NUMBER/WHATSAPP_TEMPLATE_NAME).',
      };
    }
    if (!to) {
      return { success: false, providerMessageId: null, errorMessage: 'No WhatsApp-capable phone number on file.' };
    }
    if (!templateName) {
      return { success: false, providerMessageId: null, errorMessage: 'No approved WhatsApp template name configured.' };
    }

    const c = this._cfg();
    const body = {
      integrated_number: c.whatsappSenderNumber,
      content_type: 'template',
      payload: {
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode, policy: 'deterministic' },
          to_and_components: [
            {
              to: [to],
              components: [
                {
                  type: 'body',
                  parameters: variables.map((v) => ({ type: 'text', text: String(v) })),
                },
              ],
            },
          ],
        },
      },
    };

    try {
      const res = await fetch(c.whatsappUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authkey: c.whatsappToken },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || json?.hasError) {
        return {
          success: false,
          providerMessageId: null,
          errorMessage: json?.message || (typeof json?.data === 'string' ? json.data : null) || `WhatsApp API returned HTTP ${res.status}.`,
        };
      }
      return { success: true, providerMessageId: json?.request_id || null, errorMessage: null };
    } catch (err) {
      return { success: false, providerMessageId: null, errorMessage: err.message || 'WhatsApp request failed.' };
    }
  }
}

module.exports = new WhatsAppClient();
