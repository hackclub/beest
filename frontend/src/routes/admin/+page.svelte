<script lang="ts">
	let { data } = $props();

	interface UserSummary {
		id: string;
		hcaSub: string;
		name: string | null;
		nickname: string | null;
		slackId: string | null;
		email: string;
		hackatimeConnected: boolean;
		perms: string | null;
		createdAt: string;
	}

	interface UserDetail extends UserSummary {
		twoEmails: boolean;
		updatedAt: string;
		perms: string | null;
		activeSessions: number;
		projects: { id: string; name: string; status: string; projectType: string; createdAt: string }[];
		auditLogs: { id: string; action: string; label: string; createdAt: string }[];
	}

	interface NewsItem {
		id: string;
		text: string;
		displayDate: string;
	}

	let activeTab = $state('users');
	let users: UserSummary[] = $state([]);
	let loading = $state(true);
	let userSearch = $state('');
	let permsFilter = $state('');
	let selectedUser: UserSummary | null = $state(null);
	let userDetail: UserDetail | null = $state(null);
	let detailLoading = $state(false);
	let showPermsDropdown = $state(false);
	let actionLoading = $state('');

	// News state
	let newsItems: NewsItem[] = $state([]);
	let newsLoading = $state(false);
	let editingNews: NewsItem | null = $state(null);
	let newNewsText = $state('');
	let newNewsDate = $state('');
	let newsSaving = $state(false);

	// Projects state
	interface ProjectSummary {
		id: string;
		name: string;
		description: string;
		projectType: string;
		status: string;
		codeUrl: string | null;
		demoUrl: string | null;
		readmeUrl: string | null;
		screenshot1Url: string | null;
		screenshot2Url: string | null;
		hackatimeProjectName: string[];
		isUpdate: boolean;
		otherHcProgram: string | null;
		aiUse: string | null;
		createdAt: string;
		updatedAt: string;
		user: { id: string; name: string | null; slackId: string | null };
	}

	interface StatusCounts {
		unshipped: number;
		unreviewed: number;
		changes_needed: number;
		approved: number;
	}

	let allProjects: ProjectSummary[] = $state([]);
	let statusCounts: StatusCounts = $state({ unshipped: 0, unreviewed: 0, changes_needed: 0, approved: 0 });
	let projectsLoading = $state(false);
	let projectStatusFilter = $state('');
	let projectTypeFilter = $state('');
	let projectSearch = $state('');

	// Hackatime detail expansion
	interface HackatimeDetail {
		totalHours: number;
		trustLevel: string | null;
		hackatimeProjects: { name: string; hours: number; languages: string[] }[];
		unifiedDuplicate: boolean;
		unifiedError: boolean;
	}
	let expandedProjectId = $state<string | null>(null);
	let hackatimeData = $state<HackatimeDetail | null>(null);
	let hackatimeLoading = $state(false);
	let overrideJustification = $state('');
	let userFeedback = $state('');
	let reviewSubmitting = $state(false);
	let customHours = $state(0);

	let selectedProject = $derived(allProjects.find(p => p.id === expandedProjectId) ?? null);

	async function reviewProject(status: 'approved' | 'changes_needed') {
		if (!expandedProjectId || reviewSubmitting) return;
		reviewSubmitting = true;
		try {
			const res = await fetch(`/api/admin/projects/${expandedProjectId}/review`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status }),
			});
			if (res.ok) {
				const proj = allProjects.find(p => p.id === expandedProjectId);
				if (proj) proj.status = status;
			}
		} finally {
			reviewSubmitting = false;
		}
	}

	function buildJustification(adjustedHours: number, label: string) {
		if (!hackatimeData) return;
		const trustLabels: Record<string, string> = { blue: 'standard', yellow: 'warned', red: 'banned' };
		const trustLabel = trustLabels[hackatimeData.trustLevel?.toLowerCase() ?? ''] ?? hackatimeData.trustLevel ?? 'unknown';
		const proj = allProjects.find(p => p.id === expandedProjectId);
		const updateNote = proj?.isUpdate ? ' (this is an update to an existing project)' : '';
		overrideJustification = `the user has trust level ${trustLabel} and tracked ${hackatimeData.totalHours} hours on the project through hackatime (${label} to ${adjustedHours}h)${updateNote}\n\nsigned off by ${data.user.name ?? 'unknown'}`;
	}

	function adjustHours(factor: number) {
		if (!hackatimeData) return;
		const adjusted = Math.round(hackatimeData.totalHours * factor * 10) / 10;
		customHours = adjusted;
		const label = factor === 0.5 ? 'halved' : factor === 1/3 ? 'reduced to a third' : `reduced to ${Math.round(factor * 100)}%`;
		buildJustification(adjusted, label);
	}

	function applyCustomHours() {
		if (!hackatimeData) return;
		const rounded = Math.round(customHours * 10) / 10;
		buildJustification(rounded, `adjusted`);
	}

	async function selectProject(projectId: string) {
		if (expandedProjectId === projectId) {
			expandedProjectId = null;
			hackatimeData = null;
			userFeedback = '';
			return;
		}
		expandedProjectId = projectId;
		hackatimeData = null;
		userFeedback = '';
		overrideJustification = '';

		const proj = allProjects.find(p => p.id === projectId);
		if (proj?.status === 'unreviewed') {
			hackatimeLoading = true;
			try {
				const res = await fetch(`/api/admin/projects/${projectId}/hackatime`);
				if (res.ok) {
					hackatimeData = await res.json();
					customHours = hackatimeData?.totalHours ?? 0;
					const trustLabels: Record<string, string> = { blue: 'standard', yellow: 'warned', red: 'banned' };
					const trustLabel = trustLabels[hackatimeData?.trustLevel?.toLowerCase() ?? ''] ?? hackatimeData?.trustLevel ?? 'unknown';
					const updateNote = proj.isUpdate ? ' (this is an update to an existing project)' : '';
					const unifiedNote = !hackatimeData?.unifiedDuplicate && proj.codeUrl
						? `\nAs of ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} this is the first submission of this code URL to unified.`
						: '';
					overrideJustification = `the user has trust level ${trustLabel} and tracked ${hackatimeData?.totalHours ?? 0} hours on the project through hackatime${updateNote}${unifiedNote}\n\nsigned off by ${data.user.name ?? 'unknown'}`;
				} else {
					hackatimeData = { totalHours: 0, hackatimeProjects: [], trustLevel: null, unifiedDuplicate: false, unifiedError: false };
				}
			} catch {
				hackatimeData = { totalHours: 0, hackatimeProjects: [], trustLevel: null, unifiedDuplicate: false, unifiedError: false };
			} finally {
				hackatimeLoading = false;
			}
		}
	}

	function todayDateStr(): string {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	const PERMS_OPTIONS = ['User', 'Helper', 'Reviewer', 'Fraud Reviewer', 'Super Admin', 'Banned'];

	const PROJECT_TYPES = ['web', 'windows', 'mac', 'linux', 'cross-platform', 'python', 'android', 'ios'];

	let filteredProjects = $derived.by(() => {
		let result = allProjects;
		if (projectStatusFilter) {
			result = result.filter(p => p.status === projectStatusFilter);
		}
		if (projectTypeFilter) {
			result = result.filter(p => p.projectType === projectTypeFilter);
		}
		if (projectSearch.trim()) {
			const q = projectSearch.trim().toLowerCase();
			result = result.filter(p =>
				p.name.toLowerCase().includes(q) ||
				(p.user.name?.toLowerCase().includes(q)) ||
				(p.user.slackId?.toLowerCase().includes(q))
			);
		}
		return result;
	});

	let filteredUsers = $derived.by(() => {
		let result = users;
		if (permsFilter) {
			result = result.filter(u => u.perms === permsFilter);
		}
		if (userSearch.trim()) {
			const q = userSearch.trim().toLowerCase();
			result = result.filter(u =>
				(u.name?.toLowerCase().includes(q)) ||
				(u.email?.toLowerCase().includes(q)) ||
				(u.slackId?.toLowerCase().includes(q))
			);
		}
		return result;
	});

	async function loadUsers() {
		loading = true;
		try {
			const res = await fetch('/api/admin/users');
			if (res.ok) users = await res.json();
		} finally {
			loading = false;
		}
	}

	async function selectUser(user: UserSummary) {
		selectedUser = user;
		userDetail = null;
		showPermsDropdown = false;
		detailLoading = true;
		try {
			const res = await fetch(`/api/admin/users/${user.id}`);
			if (res.ok) userDetail = await res.json();
		} finally {
			detailLoading = false;
		}
	}

	async function banUser() {
		if (!selectedUser || !confirm(`BAN this user? This will:\n- Set their Airtable status to Banned\n- Revoke all sessions\n- Redirect them to fraud.hackclub.com on any future login`)) return;
		actionLoading = 'ban';
		try {
			const res = await fetch(`/api/admin/users/${selectedUser.id}/ban`, { method: 'POST' });
			if (res.ok) {
				await selectUser(selectedUser);
			}
		} finally {
			actionLoading = '';
		}
	}

	async function updatePerms(perms: string) {
		if (!selectedUser || !confirm(`Change this user's permissions to "${perms}"?`)) return;
		actionLoading = 'perms';
		try {
			const res = await fetch(`/api/admin/users/${selectedUser.id}/perms`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ perms })
			});
			if (res.ok) {
				showPermsDropdown = false;
				await selectUser(selectedUser);
			}
		} finally {
			actionLoading = '';
		}
	}

	function closeDetail() {
		selectedUser = null;
		userDetail = null;
		showPermsDropdown = false;
	}

	function formatDate(d: string) {
		return new Date(d).toLocaleDateString('en-US', {
			year: 'numeric', month: 'short', day: 'numeric',
			hour: '2-digit', minute: '2-digit'
		});
	}

	async function loadNews() {
		newsLoading = true;
		try {
			const res = await fetch('/api/admin/news');
			if (res.ok) newsItems = await res.json();
		} finally {
			newsLoading = false;
		}
	}

	async function createNews() {
		if (!newNewsText.trim() || !newNewsDate.trim()) return;
		newsSaving = true;
		try {
			const res = await fetch('/api/admin/news', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: newNewsText, displayDate: newNewsDate })
			});
			if (res.ok) {
				newNewsText = '';
				newNewsDate = '';
				await loadNews();
			}
		} finally {
			newsSaving = false;
		}
	}

	async function saveNewsEdit() {
		if (!editingNews) return;
		newsSaving = true;
		try {
			const res = await fetch(`/api/admin/news/${editingNews.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: editingNews.text, displayDate: editingNews.displayDate })
			});
			if (res.ok) {
				editingNews = null;
				await loadNews();
			}
		} finally {
			newsSaving = false;
		}
	}

	async function deleteNews(id: string) {
		if (!confirm('Delete this news item?')) return;
		newsSaving = true;
		try {
			const res = await fetch(`/api/admin/news/${id}`, { method: 'DELETE' });
			if (res.ok) await loadNews();
		} finally {
			newsSaving = false;
		}
	}

	async function loadProjects() {
		projectsLoading = true;
		try {
			const res = await fetch('/api/admin/projects');
			if (res.ok) {
				const data = await res.json();
				allProjects = data.projects;
				statusCounts = data.statusCounts;
			}
		} finally {
			projectsLoading = false;
		}
	}

	$effect(() => {
		if (activeTab === 'users') loadUsers();
		if (activeTab === 'news') loadNews();
		if (activeTab === 'projects') loadProjects();
	});
</script>

<div class="admin-shell">
	<header class="admin-header">
		<h1>Admin Panel</h1>
		<span class="admin-user">Logged in as {data.user.name}</span>
	</header>

	<nav class="admin-tabs">
		<button class="tab" class:active={activeTab === 'users'} onclick={() => { activeTab = 'users'; closeDetail(); }}>Users</button>
		<button class="tab" class:active={activeTab === 'news'} onclick={() => activeTab = 'news'}>News</button>
		<button class="tab" class:active={activeTab === 'fulfillment'} onclick={() => activeTab = 'fulfillment'}>Fulfillment</button>
		<button class="tab" class:active={activeTab === 'projects'} onclick={() => activeTab = 'projects'}>Projects</button>
	</nav>

	<main class="admin-content">
		{#if activeTab === 'users'}
			<div class="users-layout" class:has-detail={selectedUser}>
				<div class="users-table-wrap">
					<div class="users-toolbar">
						<input type="text" placeholder="Search by name, email or Slack ID..." bind:value={userSearch} class="users-search" />
						<select bind:value={permsFilter} class="users-perms-filter">
							<option value="">All Permissions</option>
							{#each PERMS_OPTIONS as perm}
								<option value={perm}>{perm}</option>
							{/each}
						</select>
					</div>
					{#if loading}
						<p class="loading">Loading users...</p>
					{:else}
						<table class="users-table">
							<thead>
								<tr>
									<th>Name</th>
									<th>Email</th>
									<th>Perms</th>
									<th>Slack ID</th>
									<th>Hackatime</th>
									<th>Joined</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredUsers as user}
									<tr
										class:selected={selectedUser?.id === user.id}
										onclick={() => selectUser(user)}
									>
										<td>{user.name ?? '—'}</td>
										<td class="mono">{user.email}</td>
										<td><span class="badge" class:banned={user.perms === 'Banned'}>{user.perms ?? '—'}</span></td>
										<td class="mono">{user.slackId ?? '—'}</td>
										<td>{user.hackatimeConnected ? 'Yes' : 'No'}</td>
										<td>{formatDate(user.createdAt)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
						{#if filteredUsers.length === 0}
							<p class="empty">No users found.</p>
						{/if}
					{/if}
				</div>

				{#if selectedUser}
					<div class="detail-panel">
						<div class="detail-header">
							<h2>{selectedUser.name ?? 'Unknown'}</h2>
							<button class="close-btn" onclick={closeDetail}>&times;</button>
						</div>

						{#if detailLoading}
							<p class="loading">Loading...</p>
						{:else if userDetail}
							<div class="detail-sections">
								<section class="detail-section">
									<h3>Info</h3>
									<dl>
										<dt>ID</dt><dd class="mono">{userDetail.id}</dd>
										<dt>HCA Sub</dt><dd class="mono">{userDetail.hcaSub}</dd>
										<dt>Name</dt><dd>{userDetail.name ?? '—'}</dd>
										<dt>Email</dt><dd class="mono">{userDetail.email}</dd>
										<dt>Nickname</dt><dd>{userDetail.nickname ?? '—'}</dd>
										<dt>Slack ID</dt><dd class="mono">{userDetail.slackId ?? '—'}</dd>
										<dt>Hackatime</dt><dd>{userDetail.hackatimeConnected ? 'Connected' : 'Not connected'}</dd>
										<dt>Perms</dt><dd><span class="badge" class:banned={userDetail.perms === 'Banned'}>{userDetail.perms ?? 'Unknown'}</span></dd>
										<dt>Active Sessions</dt><dd>{userDetail.activeSessions}</dd>
										<dt>Joined</dt><dd>{formatDate(userDetail.createdAt)}</dd>
									</dl>
								</section>

								<section class="detail-section">
									<h3>Actions</h3>
									<div class="actions">
										<div class="perms-action">
											<button class="btn btn-promote" onclick={() => showPermsDropdown = !showPermsDropdown} disabled={actionLoading !== ''}>
												Promote / Change Role
											</button>
											{#if showPermsDropdown}
												<div class="perms-dropdown">
													{#each PERMS_OPTIONS as perm}
														<button
															class="perms-option"
															class:current={userDetail.perms === perm}
															onclick={() => updatePerms(perm)}
															disabled={userDetail.perms === perm || actionLoading !== ''}
														>
															{perm}
														</button>
													{/each}
												</div>
											{/if}
										</div>

										<button class="btn btn-ban" onclick={banUser} disabled={actionLoading !== '' || userDetail.perms === 'Banned'}>
											{actionLoading === 'ban' ? 'Banning...' : 'Ban User'}
										</button>
									</div>
								</section>

								{#if userDetail.projects?.length > 0}
									<section class="detail-section">
										<h3>Projects ({userDetail.projects.length})</h3>
										<table class="mini-table">
											<thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
											<tbody>
												{#each userDetail.projects as project}
													<tr>
														<td>{project.name}</td>
														<td>{project.projectType}</td>
														<td><span class="badge badge-{project.status}">{project.status}</span></td>
														<td>{formatDate(project.createdAt)}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</section>
								{/if}

								{#if userDetail.auditLogs?.length > 0}
									<section class="detail-section">
										<h3>Audit Log</h3>
										<table class="mini-table">
											<thead><tr><th>Action</th><th>Label</th><th>When</th></tr></thead>
											<tbody>
												{#each userDetail.auditLogs as log}
													<tr>
														<td class="mono">{log.action}</td>
														<td>{log.label}</td>
														<td>{formatDate(log.createdAt)}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</section>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{:else if activeTab === 'news'}
			<div class="news-admin">
				<div class="news-form">
					<h3>Add News Item</h3>
					<div class="news-form-fields">
						<div class="news-date-row">
							<input type="date" bind:value={newNewsDate} class="news-input news-input-date" />
							<button class="btn btn-now" onclick={() => newNewsDate = todayDateStr()}>Now</button>
						</div>
						<textarea placeholder="News text..." bind:value={newNewsText} class="news-input news-input-text" rows="2"></textarea>
						<button class="btn btn-add-news" onclick={createNews} disabled={newsSaving || !newNewsText.trim() || !newNewsDate}>
							{newsSaving ? 'Saving...' : 'Add'}
						</button>
					</div>
				</div>

				{#if newsLoading}
					<p class="loading">Loading news...</p>
				{:else if newsItems.length === 0}
					<p class="empty">No news items yet.</p>
				{:else}
					<table class="users-table">
						<thead>
							<tr>
								<th>Date</th>
								<th>Text</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each newsItems as item}
								<tr>
									{#if editingNews?.id === item.id}
										<td><input type="date" bind:value={editingNews.displayDate} class="news-edit-input" /></td>
										<td><textarea bind:value={editingNews.text} class="news-edit-input news-edit-text" rows="2"></textarea></td>
										<td class="news-actions">
											<button class="btn btn-save" onclick={saveNewsEdit} disabled={newsSaving}>Save</button>
											<button class="btn btn-cancel" onclick={() => editingNews = null}>Cancel</button>
										</td>
									{:else}
										<td>{item.displayDate}</td>
										<td>{item.text}</td>
										<td class="news-actions">
											<button class="btn btn-edit" onclick={() => editingNews = { ...item }}>Edit</button>
											<button class="btn btn-delete" onclick={() => deleteNews(item.id)} disabled={newsSaving}>Delete</button>
										</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		{:else if activeTab === 'fulfillment'}
			<p class="placeholder">Fulfillment — coming soon.</p>
		{:else if activeTab === 'projects'}
			<div class="projects-admin">
				<div class="status-pills">
					<button class="pill" class:active={projectStatusFilter === ''} onclick={() => projectStatusFilter = ''}>
						All <span class="pill-count">{statusCounts.unshipped + statusCounts.unreviewed + statusCounts.changes_needed + statusCounts.approved}</span>
					</button>
					<button class="pill pill-unshipped" class:active={projectStatusFilter === 'unshipped'} onclick={() => projectStatusFilter = projectStatusFilter === 'unshipped' ? '' : 'unshipped'}>
						Unshipped <span class="pill-count">{statusCounts.unshipped}</span>
					</button>
					<button class="pill pill-unreviewed" class:active={projectStatusFilter === 'unreviewed'} onclick={() => projectStatusFilter = projectStatusFilter === 'unreviewed' ? '' : 'unreviewed'}>
						Unreviewed <span class="pill-count">{statusCounts.unreviewed}</span>
					</button>
					<button class="pill pill-changes_needed" class:active={projectStatusFilter === 'changes_needed'} onclick={() => projectStatusFilter = projectStatusFilter === 'changes_needed' ? '' : 'changes_needed'}>
						Changes Needed <span class="pill-count">{statusCounts.changes_needed}</span>
					</button>
					<button class="pill pill-approved" class:active={projectStatusFilter === 'approved'} onclick={() => projectStatusFilter = projectStatusFilter === 'approved' ? '' : 'approved'}>
						Approved <span class="pill-count">{statusCounts.approved}</span>
					</button>
				</div>

				<div class="users-toolbar">
					<input type="text" placeholder="Search by project name, user name or Slack ID..." bind:value={projectSearch} class="users-search" />
					<select bind:value={projectTypeFilter} class="type-filter-select">
						<option value="">All Types</option>
						{#each PROJECT_TYPES as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
				</div>

				{#if projectsLoading}
					<p class="loading">Loading projects...</p>
				{:else}
					<div class="proj-split">
						<div class="proj-sidebar">
							{#if filteredProjects.length === 0}
								<p class="empty">No projects found.</p>
							{:else}
								{#each filteredProjects as project}
									<button
										class="proj-sidebar-item"
										class:active={expandedProjectId === project.id}
										onclick={() => selectProject(project.id)}
									>
										<span class="proj-sidebar-name">{project.name}</span>
										<span class="proj-sidebar-meta">
											{project.user.name ?? '—'}
											<span class="badge badge-{project.status} badge-sm">{project.status}</span>
										</span>
									</button>
								{/each}
							{/if}
						</div>

						<div class="proj-main">
							{#if selectedProject}
								<div class="proj-main-header">
									<h3 class="proj-main-title">{selectedProject.name}</h3>
									<span class="badge badge-{selectedProject.status}">{selectedProject.status}</span>
								</div>

								<p class="proj-main-desc">{selectedProject.description}</p>

								<div class="proj-main-meta">
									<span>Type: <strong>{selectedProject.projectType}</strong></span>
									<span>User: <strong>{selectedProject.user.name ?? '—'}</strong>{selectedProject.user.slackId ? ` (${selectedProject.user.slackId})` : ''}</span>
									<span>Update: <strong>{selectedProject.isUpdate ? 'Yes' : 'No'}</strong></span>
									<span>Created: <strong>{formatDate(selectedProject.createdAt)}</strong></span>
								</div>

								<div class="ht-actions">
									{#if selectedProject.codeUrl}
										<a href={selectedProject.codeUrl} target="_blank" rel="noopener" class="ht-btn ht-btn-github">GitHub</a>
									{/if}
									{#if selectedProject.demoUrl}
										<a href={selectedProject.demoUrl} target="_blank" rel="noopener" class="ht-btn ht-btn-demo">Demo</a>
									{/if}
									{#if selectedProject.readmeUrl}
										<a href={selectedProject.readmeUrl} target="_blank" rel="noopener" class="ht-btn ht-btn-readme">README</a>
									{/if}
									{#if !selectedProject.codeUrl && !selectedProject.demoUrl && !selectedProject.readmeUrl}
										<span class="ht-empty">No links provided</span>
									{/if}
								</div>

								{#if selectedProject.screenshot1Url || selectedProject.screenshot2Url}
									<div class="proj-screenshots">
										{#if selectedProject.screenshot1Url}
											<img src={selectedProject.screenshot1Url} alt="Screenshot 1" class="proj-screenshot" />
										{/if}
										{#if selectedProject.screenshot2Url}
											<img src={selectedProject.screenshot2Url} alt="Screenshot 2" class="proj-screenshot" />
										{/if}
									</div>
								{/if}

								{#if selectedProject.hackatimeProjectName?.length > 0}
									<div class="proj-info-row">
										<span class="proj-info-label">Hackatime Projects:</span>
										<span class="proj-info-value">{selectedProject.hackatimeProjectName.join(', ')}</span>
									</div>
								{/if}
								{#if selectedProject.otherHcProgram}
									<div class="proj-info-row">
										<span class="proj-info-label">Other HC Program:</span>
										<span class="proj-info-value">{selectedProject.otherHcProgram}</span>
									</div>
								{/if}
								{#if selectedProject.aiUse}
									<div class="proj-info-row">
										<span class="proj-info-label">AI Usage:</span>
										<span class="proj-info-value">{selectedProject.aiUse}</span>
									</div>
								{/if}

								{#if selectedProject.status === 'unreviewed'}
									<hr class="proj-divider" />

									<a href="https://hack-club-hq.gitbook.io/ysws-project-submission-guidelines/BLBRN8LIfoCZhFV6oMNR" target="_blank" rel="noopener" class="ht-btn ht-btn-docs" style="display:inline-flex; margin-bottom: 0.75rem;">Open Docs</a>

									{#if hackatimeLoading}
										<span class="ht-loading">Loading Hackatime data...</span>
									{:else if hackatimeData}
										<div class="ht-detail">
											<div class="ht-header">
												<span class="ht-trust">Trust Level: <strong class="trust-{hackatimeData.trustLevel ?? 'unknown'}">{{ blue: 'standard', yellow: 'warned', red: 'banned' }[hackatimeData.trustLevel?.toLowerCase() ?? ''] ?? hackatimeData.trustLevel ?? 'unknown'}</strong></span>
												<span class="ht-total">{hackatimeData.totalHours}h total</span>
											</div>
											{#if hackatimeData.hackatimeProjects.length > 0}
												<div class="ht-projects">
													{#each hackatimeData.hackatimeProjects as hp}
														<div class="ht-project">
															<span class="ht-project-name">{hp.name}</span>
															<span class="ht-project-hours">{hp.hours}h</span>
															{#if hp.languages.length > 0}
																<span class="ht-project-langs">{hp.languages.join(', ')}</span>
															{/if}
														</div>
													{/each}
												</div>
											{:else}
												<span class="ht-empty">No linked Hackatime projects found</span>
											{/if}
											{#if hackatimeData?.unifiedDuplicate}
												<div class="unified-duplicate-alert">Duplicate Found — This code URL already exists in Unified Approved Projects</div>
											{:else if hackatimeData?.unifiedError}
												<div class="unified-error-alert">Unified check failed — could not verify code URL against Approved Projects</div>
											{/if}
											<label class="ht-justification-label">
												Override Justification:
												<textarea class="ht-justification" bind:value={overrideJustification} rows="3"></textarea>
											</label>
										</div>
									{/if}

									<div class="hours-adjust">
										<span class="hours-adjust-label">Adjust Hours:</span>
										<button class="hours-btn" onclick={() => adjustHours(0.5)}>Halve</button>
										<button class="hours-btn" onclick={() => adjustHours(1/3)}>Third</button>
										<button class="hours-btn" onclick={() => adjustHours(0.25)}>Quarter</button>
										<div class="hours-custom">
											<button class="hours-tick" onclick={() => { customHours = Math.max(0, Math.round((customHours - 1) * 10) / 10); applyCustomHours(); }}>-</button>
											<input type="number" class="hours-input" bind:value={customHours} onchange={applyCustomHours} min="0" step="0.1" />
											<button class="hours-tick" onclick={() => { customHours = Math.round((customHours + 1) * 10) / 10; applyCustomHours(); }}>+</button>
										</div>
									</div>

									<hr class="proj-divider" />

									<div class="user-feedback-box">
										<label class="user-feedback-label">
											User Feedback:
											<textarea class="user-feedback" bind:value={userFeedback} rows="4" placeholder="Feedback to send to the user about their project..."></textarea>
										</label>
									</div>

									<div class="review-actions">
										<button class="review-btn review-btn-approve" onclick={() => reviewProject('approved')} disabled={reviewSubmitting}>Approve</button>
										<button class="review-btn review-btn-reject" onclick={() => reviewProject('changes_needed')} disabled={reviewSubmitting}>Reject</button>
									</div>
								{/if}
							{:else}
								<div class="proj-main-empty">
									<p>Select a project to review</p>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</main>
</div>

<style>
	.admin-shell {
		min-height: 100vh;
		background: #1a1a1a;
		color: #e0e0e0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}

	.admin-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 2rem;
		background: #111;
		border-bottom: 1px solid #333;
	}

	.admin-header h1 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.admin-user {
		font-size: 0.85rem;
		color: #888;
	}

	.admin-tabs {
		display: flex;
		gap: 0;
		background: #111;
		border-bottom: 1px solid #333;
		padding: 0 2rem;
	}

	.tab {
		padding: 0.75rem 1.5rem;
		background: none;
		border: none;
		color: #888;
		cursor: pointer;
		font-size: 0.9rem;
		border-bottom: 2px solid transparent;
		transition: color 0.15s, border-color 0.15s;
	}

	.tab:hover { color: #ccc; }
	.tab.active { color: #fff; border-bottom-color: #5b9bd5; }

	.admin-content {
		padding: 1.5rem 2rem;
	}

	.users-layout {
		display: flex;
		gap: 1.5rem;
	}

	.users-table-wrap {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
	}

	.users-toolbar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.users-search {
		flex: 1;
		background: #1e1e1e;
		border: 2px solid #666;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
	}

	.users-search:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.users-perms-filter {
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
		cursor: pointer;
	}

	.users-perms-filter:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.type-filter-select {
		background: #1e1e1e;
		border: 2px solid #666;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
		cursor: pointer;
	}

	.type-filter-select:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.users-layout.has-detail .users-table-wrap {
		flex: 0 0 45%;
	}

	.users-table, .mini-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.users-table th, .users-table td,
	.mini-table th, .mini-table td {
		padding: 0.5rem 0.75rem;
		text-align: left;
		border-bottom: 1px solid #2a2a2a;
	}

	.users-table th, .mini-table th {
		color: #888;
		font-weight: 500;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.users-table tbody tr {
		cursor: pointer;
		transition: background 0.1s;
	}

	.users-table tbody tr:hover { background: #252525; }
	.users-table tbody tr.selected { background: #1e2a3a; }

	.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8rem; }

	.detail-panel {
		flex: 0 0 50%;
		background: #222;
		border: 1px solid #333;
		border-radius: 8px;
		overflow-y: auto;
		max-height: calc(100vh - 160px);
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #333;
		position: sticky;
		top: 0;
		background: #222;
	}

	.detail-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.close-btn {
		background: none;
		border: none;
		color: #888;
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0 0.25rem;
		line-height: 1;
	}

	.close-btn:hover { color: #fff; }

	.detail-sections {
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.detail-section h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
		margin: 0 0 0.75rem 0;
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.35rem 1rem;
		margin: 0;
		font-size: 0.85rem;
	}

	dt { color: #888; }
	dd { margin: 0; }

	.badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		background: #2a3a2a;
		color: #8bc48b;
	}

	.badge.banned { background: #3a2020; color: #e05555; }
	.badge-approved { background: #1e2a3a; color: #5b9bd5; }
	.badge-unreviewed { background: #3a3520; color: #d5b85b; }
	.badge-changes_needed { background: #3a2520; color: #d58b5b; }
	.badge-unshipped { background: #2a2a2a; color: #888; }

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.btn {
		padding: 0.5rem 1rem;
		border: 1px solid #444;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 500;
		transition: background 0.15s, border-color 0.15s;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}



	.btn-promote {
		background: #1e2a3a;
		color: #5b9bd5;
		border-color: #2a3a5a;
	}

	.btn-promote:hover:not(:disabled) { background: #253550; }

	.btn-ban {
		background: #2a1515;
		color: #e05555;
		border-color: #4a2020;
	}

	.btn-ban:hover:not(:disabled) { background: #3a1a1a; }

	.perms-action { position: relative; }

	.perms-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 0.25rem;
		background: #2a2a2a;
		border: 1px solid #444;
		border-radius: 6px;
		overflow: hidden;
		z-index: 10;
		min-width: 160px;
	}

	.perms-option {
		display: block;
		width: 100%;
		padding: 0.5rem 1rem;
		background: none;
		border: none;
		color: #e0e0e0;
		text-align: left;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.perms-option:hover:not(:disabled) { background: #333; }
	.perms-option.current { color: #5b9bd5; font-weight: 600; }
	.perms-option:disabled { opacity: 0.4; cursor: not-allowed; }

	.loading, .empty, .placeholder {
		color: #888;
		text-align: center;
		padding: 2rem;
	}

	/* News admin styles */
	.news-admin {
		max-width: 900px;
	}

	.news-form {
		background: #222;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.news-form h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
		margin: 0 0 0.75rem 0;
	}

	.news-form-fields {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.5rem;
		align-items: start;
	}

	.news-date-row {
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}

	.btn-now {
		background: #2a2a2a;
		color: #ccc;
		border-color: #444;
		white-space: nowrap;
	}

	.btn-now:hover:not(:disabled) { background: #333; }

	.news-input, .news-edit-input {
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 4px;
		color: #e0e0e0;
		padding: 0.5rem;
		font-size: 0.85rem;
		font-family: inherit;
	}

	.news-input:focus, .news-edit-input:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.news-input-text {
		resize: vertical;
	}

	.news-edit-text {
		width: 100%;
		resize: vertical;
	}

	.news-actions {
		display: flex;
		gap: 0.35rem;
		white-space: nowrap;
	}

	.btn-add-news {
		background: #1e3a1e;
		color: #8bc48b;
		border-color: #2a5a2a;
		align-self: start;
	}

	.btn-add-news:hover:not(:disabled) { background: #255025; }

	.btn-edit {
		background: #1e2a3a;
		color: #5b9bd5;
		border-color: #2a3a5a;
	}

	.btn-edit:hover:not(:disabled) { background: #253550; }

	.btn-delete {
		background: #2a1515;
		color: #e05555;
		border-color: #4a2020;
	}

	.btn-delete:hover:not(:disabled) { background: #3a1a1a; }

	.btn-save {
		background: #1e3a1e;
		color: #8bc48b;
		border-color: #2a5a2a;
	}

	.btn-save:hover:not(:disabled) { background: #255025; }

	.btn-cancel {
		background: #2a2a2a;
		color: #888;
		border-color: #444;
	}

	.btn-cancel:hover:not(:disabled) { background: #333; }

	/* Projects tab */
	.projects-admin {
		max-width: 1600px;
		margin: 0 auto;
	}

	.status-pills {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.9rem;
		border-radius: 20px;
		border: 2px solid #777;
		background: #2a2a2a;
		color: #ccc;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}

	.pill:hover { background: #383838; color: #eee; }

	.pill.active { color: #fff; }

	.pill-count {
		background: #444;
		padding: 0.1rem 0.45rem;
		border-radius: 10px;
		font-size: 0.7rem;
		font-weight: 600;
		color: #ddd;
	}

	.pill.active .pill-count { background: rgba(255,255,255,0.15); }

	.pill-unshipped { background: #c48382; border-color: #e09a99; color: #fff; }
	.pill-unshipped.active { background: #d4908f; border-color: #f0b0af; }

	.pill-unreviewed { background: #b5a88e; border-color: #cbc1ae; color: #fff; }
	.pill-unreviewed.active { background: #cbc1ae; border-color: #e0d8c8; }

	.pill-changes_needed { background: #d4a55a; border-color: #e6ba70; color: #fff; }
	.pill-changes_needed.active { background: #e0b468; border-color: #f0ca80; }

	.pill-approved { background: #93b4cd; border-color: #aaccdd; color: #fff; }
	.pill-approved.active { background: #a8c6dd; border-color: #c0ddef; }

	.proj-split {
		display: flex;
		gap: 2px;
		background: #777;
		border: 2px solid #777;
		border-radius: 8px;
		overflow: hidden;
		min-height: 70vh;
	}

	.proj-sidebar {
		width: 340px;
		flex-shrink: 0;
		background: #1e1e1e;
		overflow-y: auto;
		max-height: 80vh;
	}

	.proj-sidebar-item {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		width: 100%;
		padding: 0.65rem 0.85rem;
		border: none;
		border-bottom: 1px solid #333;
		background: transparent;
		color: #ccc;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.8rem;
		transition: background 0.1s;
	}

	.proj-sidebar-item:hover {
		background: #2a2a2a;
	}

	.proj-sidebar-item.active {
		background: #2e2e2e;
		border-left: 4px solid #5b9bd5;
	}

	.proj-sidebar-name {
		font-weight: 600;
		color: #e0e0e0;
		font-size: 0.85rem;
	}

	.proj-sidebar-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #888;
		font-size: 0.75rem;
	}

	.badge-sm {
		font-size: 0.65rem;
		padding: 0.1rem 0.35rem;
	}

	.proj-main {
		flex: 1;
		background: #252525;
		padding: 1.25rem 1.5rem;
		overflow-y: auto;
		max-height: 80vh;
	}

	.proj-main-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #666;
		font-size: 0.9rem;
	}

	.proj-main-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.proj-main-title {
		margin: 0;
		font-size: 1.2rem;
		color: #fff;
	}

	.proj-main-desc {
		color: #bbb;
		font-size: 0.85rem;
		line-height: 1.5;
		margin: 0 0 1rem;
	}

	.proj-main-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		font-size: 0.8rem;
		color: #999;
		margin-bottom: 1rem;
	}

	.proj-main-meta strong {
		color: #e0e0e0;
	}

	.proj-screenshots {
		display: flex;
		gap: 0.75rem;
		margin: 1rem 0;
	}

	.proj-screenshot {
		max-width: 280px;
		max-height: 200px;
		border: 2px solid #555;
		border-radius: 6px;
		object-fit: cover;
	}

	.proj-info-row {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 0.85rem;
		margin-bottom: 0.4rem;
	}

	.proj-info-label {
		color: #999;
		flex-shrink: 0;
	}

	.proj-info-value {
		color: #e0e0e0;
	}

	.proj-divider {
		border: none;
		border-top: 2px solid #666;
		margin: 1rem 0;
	}

	.ht-actions {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.ht-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 1.5rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		font-family: inherit;
		text-decoration: none;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.ht-btn:hover {
		opacity: 0.85;
	}

	.ht-btn-github {
		background: #7b5ea7;
		color: #fff;
		border: 2px solid #a080d0;
	}

	.ht-btn-demo {
		background: #5b9bd5;
		color: #fff;
		border: 2px solid #8fc4ef;
	}

	.ht-btn-readme {
		background: #4a9a5a;
		color: #fff;
		border: 2px solid #6abf7a;
	}

	.ht-btn-docs {
		background: #fff;
		color: #111;
		border: 2px solid #ddd;
	}

	.user-feedback-box {
		margin-top: 0.25rem;
	}

	.user-feedback-label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: #aaa;
	}

	.user-feedback {
		background: #1e1e1e;
		border: 2px solid #777;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
		resize: vertical;
	}

	.user-feedback:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.hours-adjust {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.hours-adjust-label {
		font-size: 0.8rem;
		color: #aaa;
	}

	.hours-btn {
		height: 30px;
		padding: 0 0.85rem;
		border: 2px solid #777;
		border-radius: 6px;
		background: #333;
		color: #e0e0e0;
		font-size: 0.8rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
	}

	.hours-btn:hover {
		background: #444;
	}

	.hours-custom {
		display: flex;
		align-items: center;
		gap: 0;
		margin-left: 0.5rem;
	}

	.hours-tick {
		width: 30px;
		height: 30px;
		border: 2px solid #777;
		background: #333;
		color: #e0e0e0;
		font-size: 1rem;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: inherit;
	}

	.hours-tick:first-child {
		border-radius: 6px 0 0 6px;
		border-right: none;
	}

	.hours-tick:last-child {
		border-radius: 0 6px 6px 0;
		border-left: none;
	}

	.hours-tick:hover {
		background: #444;
	}

	.hours-input {
		width: 55px;
		height: 30px;
		border: 2px solid #777;
		border-left: none;
		border-right: none;
		background: #1e1e1e;
		color: #e0e0e0;
		font-size: 0.85rem;
		font-family: inherit;
		text-align: center;
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.hours-input::-webkit-inner-spin-button,
	.hours-input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.hours-input:focus {
		outline: none;
		border-color: #5b9bd5;
	}


	.review-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.review-btn {
		flex: 1;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 700;
		font-family: inherit;
		cursor: pointer;
		transition: opacity 0.15s;
		color: #fff;
	}

	.review-btn:hover {
		opacity: 0.85;
	}

	.review-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.review-btn-approve {
		background: #4a9a5a;
	}

	.review-btn-reject {
		background: #c44040;
	}

	.ht-detail {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.ht-header {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		font-size: 0.85rem;
		color: #ccc;
	}

	.ht-trust strong {
		font-weight: 600;
	}

	.trust-green { color: #4caf50; }
	.trust-blue { color: #5b9bd5; }
	.trust-yellow { color: #ffc107; }
	.trust-red { color: #f44336; }
	.trust-unknown { color: #888; }

	.ht-total {
		color: #5b9bd5;
		font-weight: 600;
	}

	.ht-projects {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.ht-project {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: #2a2a2a;
		border: 2px solid #666;
		border-radius: 4px;
		padding: 0.35rem 0.6rem;
		font-size: 0.8rem;
		color: #ddd;
	}

	.ht-project-name {
		font-weight: 600;
		color: #e0e0e0;
	}

	.ht-project-hours {
		color: #5b9bd5;
	}

	.ht-project-langs {
		color: #888;
		font-size: 0.75rem;
	}

	.ht-loading {
		color: #888;
		font-size: 0.85rem;
	}

	.ht-empty {
		color: #666;
		font-size: 0.85rem;
		font-style: italic;
	}

	.unified-duplicate-alert {
		background: rgba(220, 50, 50, 0.15);
		border: 2px solid #c44040;
		border-radius: 6px;
		color: #f44336;
		font-weight: 700;
		font-size: 0.85rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
	}

	.unified-error-alert {
		background: rgba(212, 165, 90, 0.15);
		border: 2px solid #d4a55a;
		border-radius: 6px;
		color: #d4a55a;
		font-weight: 700;
		font-size: 0.85rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
	}

	.ht-justification-label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: #aaa;
		margin-top: 0.25rem;
	}

	.ht-justification {
		background: #1e1e1e;
		border: 2px solid #777;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
		resize: vertical;
	}

	.ht-justification:focus {
		outline: none;
		border-color: #5b9bd5;
	}
</style>
