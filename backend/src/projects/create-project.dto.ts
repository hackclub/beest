export class CreateProjectDto {
  name: string;
  description: string;
  projectType: string;
  codeUrl?: string;
  readmeUrl?: string;
  demoUrl?: string;
  screenshots?: string[];
  hackatimeProjectName?: string[];
  isUpdate?: boolean;
  otherHcProgram?: string;
  aiUse?: string;
}
