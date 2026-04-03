export class UpdateProjectDto {
  name?: string;
  description?: string;
  projectType?: string;
  codeUrl?: string | null;
  readmeUrl?: string | null;
  demoUrl?: string | null;
  screenshots?: string[];
  hackatimeProjectName?: string[] | null;
  isUpdate?: boolean;
  otherHcProgram?: string | null;
  aiUse?: string | null;
  status?: string;
}
