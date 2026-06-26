export class CreateDevlogDto {
  title: string;
  text: string;
  /** Required: every devlog must be attached to one of the user's projects. */
  projectId: string;
  /** Base64 data URIs (data:image/png;base64,...). Max 4 images. */
  images?: string[];
  /** Optional id of an unattached Lookout session to attach to this devlog. */
  lookoutSessionId?: string;
}
